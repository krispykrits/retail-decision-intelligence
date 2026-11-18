import { Link } from 'react-router-dom'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { percentLabel, valueLabel } from './format'

export function DashboardSignals({ signals }: { signals: Dashboard['signals'] }) {
  return (
    <Panel aria-labelledby="signals-title">
      <h2 id="signals-title" className="mb-3 flex items-center gap-2 text-base font-semibold">
        <WorkspaceIcon path="/forecast" className="size-5 text-brand" />
        Notable changes &amp; investigation signals
      </h2>
      {signals.items.length ? (
        <DataTable
          columns={{
            evidence: 'Observed change',
            delta: 'vs. prior period',
            action: 'Investigation',
          }}
          className="text-xs [&_:is(th,td)]:py-2"
          viewportClassName="rounded-none! border-0!"
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
