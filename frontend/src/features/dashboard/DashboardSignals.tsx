import { Link } from 'react-router-dom'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { percentLabel, valueLabel } from './format'

export function DashboardSignals({ signals }: { signals: Dashboard['signals'] }) {
  const items = signals.items.filter(({ type }) => type !== 'engagement')

  return (
    <Panel aria-labelledby="signals-title">
      <PanelHeading
        id="signals-title"
        title="Notable changes & investigation signals"
        icon="search"
        helpLabel="Investigation signals"
        className="relative mb-2 text-base"
      >
        Compares the same filters across equal-length periods. Highlights the biggest dollar
        increase and decrease among departments or commodities with transactions in both periods,
        plus any change in net units.
      </PanelHeading>
      {items.length ? (
        <DataTable
          columns={{
            area: 'Area',
            delta: 'Change vs. prior period',
            meaning: 'What changed',
            action: 'Suggested investigation',
          }}
          className="mt-2 text-xs"
          viewportClassName="rounded-none! border-0!"
        >
          {items.map((signal) => {
            const { metric, delta, evidence } = signal
            const volume = signal.type === 'volume'
            const action = volume ? 'Explore baskets' : 'Explore merchandise'
            const before = valueLabel(metric, evidence.prior)
            const after = valueLabel(metric, evidence.current)
            const amount = Number(delta.amount)
            const change =
              delta.percent == null
                ? `${amount > 0 ? '+' : ''}${valueLabel(metric, delta.amount)}`
                : percentLabel(delta.percent)

            return (
              <tr key={signal.type}>
                <th scope="row" className="font-semibold">
                  <span className="flex items-center gap-2">
                    <WorkspaceIcon
                      path={volume ? '/baskets' : '/merchandise'}
                      className="size-4 shrink-0 text-brand"
                    />
                    {volume ? 'Net units' : evidence.name}
                  </span>
                </th>
                <td>
                  <span
                    className={`inline-block rounded-md px-1.5 py-0.5 font-semibold whitespace-nowrap tabular-nums ${amount < 0 ? 'bg-red-50 text-error' : 'bg-emerald-50 text-success'}`}
                  >
                    {change}
                  </span>
                </td>
                <td className="min-w-36 text-ink">
                  {volume ? 'Net units' : 'Net spend'} went from {before} in the prior period to{' '}
                  {after} in the selected period.
                </td>
                <td>
                  <Link
                    to={{
                      pathname: signal.route,
                      search: new URLSearchParams(signal.route_filters).toString(),
                    }}
                    className="inline-block rounded-md bg-blue-50 px-2 py-1 font-semibold whitespace-nowrap no-underline hover:bg-blue-100"
                    aria-label={`${action} for ${evidence.name}`}
                  >
                    {action} →
                  </Link>
                </td>
              </tr>
            )
          })}
        </DataTable>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No additional changes to investigate for this selection.
        </p>
      )}
    </Panel>
  )
}
