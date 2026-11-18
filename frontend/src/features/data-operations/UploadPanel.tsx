import { pendingImportId } from '../../api/imports'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { Spinner } from '../../components/Spinner'
import { ImportResults } from './ImportResults'
import { control, datasets, focus, tableStyle } from './display'
import type { useImportQueue } from './useImportQueue'

export function UploadPanel({ queue }: { queue: ReturnType<typeof useImportQueue> }) {
  const { files, queued, progress, uploading, uploadError, results, selectFile, importFiles } =
    queue
  return (
    <Panel aria-labelledby="upload-heading">
      <PanelHeading
        id="upload-heading"
        title="Upload CSV files"
        icon="upload"
        className="mb-3 xl:min-h-9"
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
        <p className="text-xs text-muted">Adds new records. Existing records are preserved.</p>
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
  )
}
