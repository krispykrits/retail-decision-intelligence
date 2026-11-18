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
import { Panel, PanelHeading } from '../components/Panel'
import { Skeleton } from '../components/Skeleton'
import { Spinner } from '../components/Spinner'
import { WorkspaceHeader } from '../components/layout/WorkspaceHeader'

const datasets = [
  ['households', 'Households'],
  ['products', 'Products'],
  ['transactions', 'Transactions'],
] as const satisfies readonly (readonly [Dataset, string])[]

const control =
  'rounded-lg border border-field-line px-3 py-1.5 text-sm font-medium text-link hover:border-brand/40 hover:bg-canvas'
const tableStyle = 'text-xs [&_:is(th,td)]:px-2.5 [&_:is(th,td)]:py-2'
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
  const inventory = useRows(getDatasets)
  const history = useRows(getImportHistory, administrator)
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
    <div className="space-y-3 md:space-y-4">
      <WorkspaceHeader path="/data" />
      <div
        className={`grid items-start gap-3 md:gap-4 ${administrator ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}`}
      >
        {administrator && (
          <Panel aria-labelledby="upload-heading">
            <PanelHeading
              id="upload-heading"
              title="Upload CSV files"
              icon="upload"
              className="mb-3"
            />
            <DataTable
              className={`${tableStyle} min-w-78`}
              viewportLabel="CSV file selection"
              columns={{
                dataset: 'Dataset',
                file: 'Selected file',
                actions: <span className="sr-only">File actions</span>,
              }}
            >
              {datasets.map(([dataset, label]) => (
                <tr key={dataset}>
                  <th scope="row">{label}</th>
                  <td className="w-full break-all">{files[dataset]?.name ?? '—'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
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
                        className={`${focus} rounded px-2 py-1 text-base hover:bg-canvas disabled:opacity-30`}
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
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                className={`${focus} rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50`}
                type="button"
                disabled={uploading || (!queued.length && !pendingImportId())}
                onClick={importFiles}
              >
                {uploading ? 'Importing…' : pendingImportId() ? 'Resume import' : 'Import files'}
              </button>
              <p className="text-xs text-muted">
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
          </Panel>
        )}

        <Panel aria-labelledby="inventory-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <PanelHeading id="inventory-heading" title="Stored datasets" icon="/data" />
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
            className={`${tableStyle} min-w-85`}
            viewportLabel="Stored dataset records"
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
                  {inventory.status === 'loading' ? (
                    <>
                      <td>
                        <Skeleton className="h-3 w-10" />
                      </td>
                      <td>
                        <Skeleton className="h-3 w-16" />
                      </td>
                      <td>
                        <Skeleton className="h-3 w-20" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="tabular-nums">{row?.records.toLocaleString() ?? '—'}</td>
                      <td>
                        {lastImport ? (
                          <time dateTime={lastImport}>{new Date(lastImport).toLocaleString()}</time>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{range ? `${range.start} to ${range.end}` : '—'}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </DataTable>
          {inventory.status === 'loading' && (
            <p className="sr-only" role="status">
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
        </Panel>

        {administrator && (
          <Panel className="xl:col-span-2" aria-labelledby="history-heading">
            <PanelHeading id="history-heading" title="Import history" icon="clock" />
            {history.status === 'loading' && !history.rows.length && (
              <div className="mt-4 grid gap-3" role="status">
                <span className="sr-only">Loading import history…</span>
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
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
            {history.rows.length > 0 && (
              <div
                className={`mt-1 h-64 overflow-y-auto pr-2 ${focus}`}
                role="region"
                aria-label="Past imports"
                aria-busy={history.status === 'loading'}
                tabIndex={0}
              >
                <ImportResults results={history.rows} />
              </div>
            )}
            {history.status === 'ready' && !history.rows.length && (
              <p className="mt-3 text-sm text-muted">No imports yet.</p>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}
