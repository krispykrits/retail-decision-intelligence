import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDatasets,
  getImportHistory,
  pendingImportId,
  resumeImport,
  uploadCsv,
  type Dataset,
  type ImportResult,
} from '../api/imports'
import { useSession } from '../auth/session'
import { DataTable } from '../components/DataTable'
import { ImportResults } from '../components/ImportResults'
import { Spinner } from '../components/Spinner'

const datasets = [
  ['households', 'Households'],
  ['products', 'Products'],
  ['transactions', 'Transactions'],
] as const satisfies readonly (readonly [Dataset, string])[]

const panel = 'rounded-2xl border border-line bg-surface shadow-panel p-5 md:p-6'
const heading = 'text-xl font-semibold'
const control =
  'rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-canvas'
const focus = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus'
const button = `${control} ${focus} disabled:cursor-not-allowed disabled:opacity-50`

function useRows<T>(load: (signal: AbortSignal) => Promise<T[]>, enabled = true) {
  const [rows, setRows] = useState<T[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void load(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setRows(data)
        setStatus('ready')
      },
      () => {
        if (!controller.signal.aborted) setStatus('error')
      },
    )
    return () => controller.abort()
  }, [enabled, load, refreshCount])

  const refresh = useCallback(() => {
    setStatus('loading')
    setRefreshCount((count) => count + 1)
  }, [])

  return { rows, status, refresh }
}

export function DataOperationsPage() {
  const { account } = useSession()
  const administrator = account?.roles.includes('Administrator') ?? false
  const [files, setFiles] = useState<Partial<Record<Dataset, File>>>({})
  const [progress, setProgress] = useState<string | null>(() =>
    administrator && pendingImportId() ? 'Checking import status…' : null,
  )
  const activeRequest = useRef<AbortController | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [results, setResults] = useState<ImportResult[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const inventory = useRows(getDatasets)
  const history = useRows(getImportHistory, administrator && historyOpen)
  const queued = datasets.flatMap(([dataset, label]) => {
    const file = files[dataset]
    return file ? [{ dataset, label, file }] : []
  })
  const { refresh: refreshInventory } = inventory
  const { refresh: refreshHistory } = history
  const uploading = progress !== null

  const continueImport = useCallback(
    async (id: string, controller: AbortController) => {
      try {
        const result = await resumeImport(id, setProgress, controller.signal)
        if (!controller.signal.aborted) setResults((current) => [...current, result])
      } catch (error) {
        if (!controller.signal.aborted) {
          setUploadError(
            error instanceof Error ? error.message : 'Import status could not be loaded.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setProgress(null)
          refreshInventory()
          refreshHistory()
        }
      }
    },
    [refreshInventory, refreshHistory],
  )

  useEffect(() => {
    const pending = administrator && pendingImportId()
    if (pending) {
      const controller = new AbortController()
      activeRequest.current = controller
      void Promise.resolve().then(() => {
        if (!controller.signal.aborted) return continueImport(pending, controller)
      })
    }
    return () => activeRequest.current?.abort()
  }, [administrator, continueImport])

  function selectFile(dataset: Dataset, file?: File) {
    setFiles((current) => ({ ...current, [dataset]: file }))
  }

  async function importFiles() {
    if (uploading || !administrator) return
    const controller = new AbortController()
    activeRequest.current = controller
    setUploadError('')
    setResults([])
    const pending = pendingImportId()
    if (pending) {
      setProgress('Checking import status…')
      await continueImport(pending, controller)
      return
    }

    try {
      for (const [index, { dataset, label, file }] of queued.entries()) {
        setProgress(`Importing ${label} (${index + 1} of ${queued.length})…`)
        const result = await uploadCsv(dataset, file, setProgress, controller.signal)
        setResults((current) => [...current, result])
        if (result.status === 'failed') break
        if (result.status === 'completed') selectFile(dataset)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setUploadError(
        error instanceof Error && error.name !== 'TypeError'
          ? error.message
          : 'The import result could not be confirmed. Refresh or retry the same file.',
      )
    } finally {
      if (!controller.signal.aborted) {
        setProgress(null)
        refreshInventory()
        refreshHistory()
      }
    }
  }

  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight md:text-4xl">Data Operations</h1>
      <p className="mb-8 text-muted">Upload and review retail datasets.</p>
      <div className="grid gap-5">
        {administrator && (
          <section className={panel} aria-labelledby="upload-heading">
            <h2 className={`mb-4 ${heading}`} id="upload-heading">
              Upload CSV files
            </h2>
            <DataTable
              className="min-w-120"
              columns={{
                dataset: 'Dataset',
                file: 'Selected file',
                actions: <span className="sr-only">File actions</span>,
              }}
            >
              {datasets.map(([dataset, label]) => (
                <tr key={dataset}>
                  <th scope="row">{label}</th>
                  <td className="break-all">{files[dataset]?.name ?? '—'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <label>
                        <input
                          className="peer sr-only"
                          type="file"
                          accept=".csv,text/csv"
                          aria-label={`Choose ${label} CSV`}
                          disabled={uploading}
                          onChange={({ currentTarget }) => {
                            const file = currentTarget.files?.[0]
                            if (file) selectFile(dataset, file)
                            currentTarget.value = ''
                          }}
                        />
                        <span
                          className={`${control} inline-block cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
                        >
                          Choose file
                        </span>
                      </label>
                      <button
                        type="button"
                        aria-label={`Remove ${label} file`}
                        className={`${focus} rounded px-2 py-1 text-lg hover:bg-canvas disabled:opacity-30`}
                        disabled={uploading || !files[dataset]}
                        onClick={() => selectFile(dataset)}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                className={`${focus} rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50`}
                type="button"
                disabled={uploading || (!queued.length && !pendingImportId())}
                onClick={importFiles}
              >
                {uploading ? 'Importing…' : pendingImportId() ? 'Resume import' : 'Import files'}
              </button>
              <p className="text-sm text-muted">
                Adds new records. Existing records are preserved.
              </p>
            </div>
            <p
              className={progress ? 'mt-3 flex items-center gap-2 text-sm text-muted' : 'sr-only'}
              role="status"
            >
              {progress && <Spinner />}
              {progress ?? (results.length ? 'Import results are available below.' : '')}
            </p>
            {uploadError && (
              <p className="mt-3 text-sm text-error" role="alert">
                {uploadError}
              </p>
            )}
            {!!results.length && <ImportResults results={results} />}
          </section>
        )}

        <section className={panel} aria-labelledby="inventory-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className={heading} id="inventory-heading">
              Stored datasets
            </h2>
            <button
              className={button}
              type="button"
              disabled={inventory.status === 'loading'}
              onClick={inventory.refresh}
            >
              Refresh
            </button>
          </div>
          <DataTable
            className="min-w-120"
            columns={{
              dataset: 'Dataset',
              records: 'Records',
              lastImport: 'Last import',
              range: 'Data range',
            }}
            busy={inventory.status === 'loading'}
          >
            {datasets.map(([dataset, label]) => {
              const row = inventory.rows.find((item) => item.dataset === dataset)
              const lastImport = row?.last_success
              const range = row?.source_window
              return (
                <tr key={dataset}>
                  <th scope="row">{label}</th>
                  <td className="tabular-nums">{row?.records.toLocaleString() ?? '—'}</td>
                  <td>
                    {lastImport ? (
                      <time dateTime={lastImport}>{new Date(lastImport).toLocaleString()}</time>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{range ? `${range.start} to ${range.end}` : '—'}</td>
                </tr>
              )
            })}
          </DataTable>
          {inventory.status === 'loading' && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted" role="status">
              <Spinner />
              Loading stored datasets…
            </p>
          )}
          {inventory.status === 'error' && (
            <p className="mt-2 text-sm text-error" role="alert">
              Stored datasets could not be loaded.
            </p>
          )}
          {inventory.status === 'ready' && inventory.rows.every((row) => row.records === 0) && (
            <p className="mt-2 text-sm text-muted">No records have been imported yet.</p>
          )}
        </section>

        {administrator && (
          <details
            className={panel}
            onToggle={({ currentTarget }) => {
              setHistoryOpen(currentTarget.open)
              if (currentTarget.open) history.refresh()
            }}
          >
            <summary className={`${heading} ${focus} cursor-pointer`}>Import history</summary>
            {history.status === 'loading' && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
                <Spinner />
                Loading import history…
              </p>
            )}
            {history.status === 'error' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-sm text-error" role="alert">
                  Import history could not be loaded.
                </p>
                <button type="button" className={button} onClick={history.refresh}>
                  Retry
                </button>
              </div>
            )}
            {history.rows.length ? <ImportResults results={history.rows} /> : null}
            {history.status === 'ready' && !history.rows.length && (
              <p className="mt-3 text-sm text-muted">No imports yet.</p>
            )}
          </details>
        )}
      </div>
    </>
  )
}
