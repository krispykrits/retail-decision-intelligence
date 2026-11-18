import { Link } from 'react-router-dom'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel } from '../../components/Panel'
import { percentLabel, valueLabel } from './format'

export function DashboardSignals({ signals }: { signals: Dashboard['signals'] }) {
  return (
    <Panel aria-labelledby="signals-title">
      <h2 id="signals-title" className="mb-3 font-semibold">
        Investigation signals
      </h2>
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
                  className="font-semibold underline-offset-2 hover:underline"
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
