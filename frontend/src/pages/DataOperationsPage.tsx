import { useEffect, useRef, useState } from 'react'
import {
  getDatasets,
  getImportHistory,
  uploadCsv,
  type Dataset,
  type DatasetSummary,
  type ImportResult,
} from '../api/imports'
import { useSession } from '../auth/session'
import { ImportResults } from '../components/ImportResults'

const datasets = [
  ['households', 'Households'],
  ['products', 'Products'],
  ['transactions', 'Transactions'],
] as const satisfies readonly (readonly [Dataset, string])[]

const panel = 'rounded-xl border border-line bg-white p-5 md:p-6'
const button =
  'rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-canvas focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50'
const headerCell = 'px-3 py-2 text-left font-semibold'

export function DataOperationsPage() {
  const { account } = useSession()
  const administrator = account?.roles.includes('Administrator') ?? false
  const [files, setFiles] = useState<Partial<Record<Dataset, File>>>({})
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [results, setResults] = useState<ImportResult[]>([])
  const [inventory, setInventory] = useState<DatasetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const [history, setHistory] = useState<ImportResult[] | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyPanel = useRef<HTMLDetailsElement>(null)

  function refreshInventory() {
    setLoading(true)
    setInventoryError('')
    setInventoryVersion((current) => current + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    void getDatasets(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setInventory(rows)
      })
      .catch(() => {
        if (!controller.signal.aborted) setInventoryError('Stored datasets could not be loaded.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [inventoryVersion])

  async function refreshHistory() {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      setHistory(await getImportHistory())
    } catch {
      setHistoryError('Import history could not be loaded.')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function importFiles() {
    if (uploading || !administrator) return
    setUploading(true)
    setUploadError('')
    setResults([])
    const queued = datasets.flatMap(([dataset, label]) => {
      const file = files[dataset]
      return file ? [{ dataset, label, file }] : []
    })

    try {
      for (const [index, { dataset, label, file }] of queued.entries()) {
        setProgress(`Importing ${label} (${index + 1} of ${queued.length})…`)
        const result = await uploadCsv(dataset, file)
        setResults((current) => [...current, result])
        if (result.status === 'failed') break
        if (result.status === 'completed') {
          setFiles((current) => ({ ...current, [dataset]: undefined }))
        }
      }
    } catch (error) {
      setUploadError(
        error instanceof Error && error.name !== 'TypeError'
          ? error.message
          : 'The import result could not be confirmed. Refresh or retry the same file.',
      )
    } finally {
      setProgress('')
      setUploading(false)
      refreshInventory()
      if (historyPanel.current?.open) void refreshHistory()
      else setHistory(null)
    }
  }

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold md:text-4xl">Data Operations</h1>
      <p className="mb-8 text-muted">Upload and review retail datasets.</p>
      <div className="grid gap-5">
        {administrator && (
          <section className={panel} aria-labelledby="upload-heading">
            <h2 className="mb-4 text-xl font-semibold" id="upload-heading">
              Upload CSV files
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 text-sm">
                <thead className="bg-canvas">
                  <tr>
                    <th className={headerCell} scope="col">
                      Dataset
                    </th>
                    <th className={headerCell} scope="col">
                      Selected file
                    </th>
                    <th className={headerCell} scope="col">
                      <span className="sr-only">File actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map(([dataset, label]) => (
                    <tr className="border-b border-line" key={dataset}>
                      <th className={headerCell} scope="row">
                        {label}
                      </th>
                      <td className="px-3 py-2 break-all">{files[dataset]?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <label className="inline-flex">
                            <input
                              className="peer sr-only"
                              type="file"
                              accept=".csv,text/csv"
                              aria-label={`Choose ${label} CSV`}
                              disabled={uploading}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0]
                                if (file) setFiles((current) => ({ ...current, [dataset]: file }))
                                event.currentTarget.value = ''
                              }}
                            />
                            <span
                              className={`${button} cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
                            >
                              Choose file
                            </span>
                          </label>
                          <button
                            type="button"
                            aria-label={`Remove ${label} file`}
                            className="rounded px-2 py-1 text-lg hover:bg-canvas focus-visible:outline-3 focus-visible:outline-focus disabled:opacity-30"
                            disabled={uploading || !files[dataset]}
                            onClick={() =>
                              setFiles((current) => ({ ...current, [dataset]: undefined }))
                            }
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:brightness-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={uploading || !Object.values(files).some(Boolean)}
                onClick={() => void importFiles()}
              >
                {uploading ? 'Importing…' : 'Import files'}
              </button>
              <p className="text-sm text-muted">
                Adds new records. Existing records are preserved.
              </p>
            </div>
            <p className={progress ? 'mt-3 text-sm text-muted' : 'sr-only'} role="status">
              {progress || (results.length ? 'Import results are available below.' : '')}
            </p>
            {uploadError && (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {uploadError}
              </p>
            )}
            {!!results.length && <ImportResults results={results} />}
          </section>
        )}

        <section className={panel} aria-labelledby="inventory-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold" id="inventory-heading">
              Stored datasets
            </h2>
            <button
              className={button}
              type="button"
              disabled={loading}
              onClick={() => refreshInventory()}
            >
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto" aria-busy={loading}>
            <table className="w-full min-w-120 text-sm">
              <thead className="bg-canvas">
                <tr>
                  <th className={headerCell} scope="col">
                    Dataset
                  </th>
                  <th className={headerCell} scope="col">
                    Records
                  </th>
                  <th className={headerCell} scope="col">
                    Last import
                  </th>
                  <th className={headerCell} scope="col">
                    Data range
                  </th>
                </tr>
              </thead>
              <tbody>
                {datasets.map(([dataset, label]) => {
                  const row = inventory.find((item) => item.dataset === dataset)
                  return (
                    <tr className="border-b border-line" key={dataset}>
                      <th className={headerCell} scope="row">
                        {label}
                      </th>
                      <td className="px-3 py-2 tabular-nums">
                        {row?.records.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row?.last_success ? (
                          <time dateTime={row.last_success}>
                            {new Date(row.last_success).toLocaleString()}
                          </time>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row?.source_window
                          ? `${row.source_window.start} to ${row.source_window.end}`
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {loading && (
            <p className="mt-2 text-sm text-muted" role="status">
              Loading stored datasets…
            </p>
          )}
          {inventoryError && (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {inventoryError}
            </p>
          )}
          {!loading && !inventoryError && inventory.every((row) => row.records === 0) && (
            <p className="mt-2 text-sm text-muted">No records have been imported yet.</p>
          )}
        </section>

        {administrator && (
          <details
            className={panel}
            ref={historyPanel}
            onToggle={(event) => {
              if (event.currentTarget.open) void refreshHistory()
            }}
          >
            <summary className="cursor-pointer text-xl font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Import history
            </summary>
            {historyLoading && (
              <p className="mt-3 text-sm text-muted" role="status">
                Loading import history…
              </p>
            )}
            {historyError && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-sm text-red-700" role="alert">
                  {historyError}
                </p>
                <button type="button" className={button} onClick={() => void refreshHistory()}>
                  Retry
                </button>
              </div>
            )}
            {history?.length ? <ImportResults results={history} /> : null}
            {!historyLoading && history?.length === 0 && (
              <p className="mt-3 text-sm text-muted">No imports yet.</p>
            )}
          </details>
        )}
      </div>
    </>
  )
}
