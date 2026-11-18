import { Link } from 'react-router-dom'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { percentLabel, valueLabel } from './format'

export function DashboardSignals({ signals }: { signals: Dashboard['signals'] }) {
  return (
    <Panel aria-labelledby="signals-title">
      <h2 id="signals-title" className="flex items-center gap-2 font-semibold">
        <WorkspaceIcon path="/forecast" className="size-5 text-brand" />
        Notable changes &amp; investigation signals
      </h2>
      <p className="mt-0.5 mb-3 text-sm text-muted">
        Observed shifts compared with the prior period.
      </p>
      {signals.items.length ? (
        <DataTable
          columns={{ evidence: 'Observed change', delta: 'Change', action: 'Investigation' }}
        >
          {signals.items.map((signal) => (
            <tr key={signal.type}>
              <td>
                <p className="font-medium">{signal.reason}</p>
                <p className="text-xs text-muted">
                  {valueLabel(signal.metric, signal.evidence.prior)} to{' '}
                  {valueLabel(signal.metric, signal.evidence.current)}
                  {' · '}
                  {valueLabel('units', signal.evidence.prior_lines)} to{' '}
                  {valueLabel('units', signal.evidence.current_lines)} lines
                </p>
              </td>
              <td
                className={
                  Number(signal.delta.amount) < 0
                    ? 'font-semibold text-error'
                    : 'font-semibold text-success'
                }
              >
                {signal.delta.percent == null
                  ? valueLabel(signal.metric, signal.delta.amount)
                  : percentLabel(signal.delta.percent)}
              </td>
              <td>
                <Link
                  to={{
                    pathname: signal.route,
                    search: new URLSearchParams(signal.route_filters).toString(),
                    hash: 'performance-trend',
                  }}
                  className="inline-block rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold whitespace-nowrap no-underline hover:bg-blue-100"
                  aria-label={`View trend for ${signal.evidence.name}`}
                >
                  View trend →
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <p className="text-sm text-muted">
          No changes can be flagged with the available evidence for this selection.
        </p>
      )}
    </Panel>
  )
}
