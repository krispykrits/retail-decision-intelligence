import type { DatasetSummary } from '../../api/imports'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { Skeleton } from '../../components/Skeleton'
import { button, datasets, tableStyle } from './display'
import type { useRows } from './useRows'
import { dataOperationsPath } from '../../app/workspaces'

export function InventoryPanel({
  inventory,
  administrator,
}: {
  inventory: ReturnType<typeof useRows<DatasetSummary>>
  administrator: boolean
}) {
  return (
    <Panel
      aria-labelledby="inventory-heading"
      className={administrator ? 'xl:grid xl:grid-rows-[auto_1fr]' : undefined}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 xl:min-h-9">
        <PanelHeading id="inventory-heading" title="Stored datasets" icon={dataOperationsPath} />
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
        className={`${tableStyle} min-w-85 ${administrator ? 'xl:h-full xl:[&_thead]:h-8' : ''}`}
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
  )
}
