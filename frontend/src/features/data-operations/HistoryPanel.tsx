import type { ImportResult } from '../../api/imports'
import { Panel, PanelHeading } from '../../components/Panel'
import { Skeleton } from '../../components/Skeleton'
import { ImportResults } from './ImportResults'
import { button, focus } from './display'
import type { useRows } from './useRows'

export function HistoryPanel({ history }: { history: ReturnType<typeof useRows<ImportResult>> }) {
  return (
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
  )
}
