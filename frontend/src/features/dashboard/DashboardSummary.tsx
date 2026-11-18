import type { Dashboard, Metric } from '../../api/dashboard'
import type { Workspace } from '../../app/workspaces'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { metrics, percentLabel, periodLabel, valueLabel } from './format'

const cards: { metric: Metric; icon: Workspace['path']; definition: string }[] = [
  { metric: 'spend', icon: '/merchandise', definition: 'Sales less returns and adjustments.' },
  { metric: 'baskets', icon: '/baskets', definition: 'Distinct baskets with transaction records.' },
  {
    metric: 'households',
    icon: '/customers',
    definition: 'Households with a positive-unit purchase.',
  },
  {
    metric: 'avg_basket',
    icon: '/command-center',
    definition: 'Net spend divided by distinct baskets.',
  },
]

export function DashboardSummary({ summary }: { summary: Dashboard['summary'] }) {
  const prior = summary.prior_period
  return (
    <section aria-label="Retail metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ metric, icon, definition }) => {
        const delta = summary.changes[metric]
        const direction = Math.sign(Number(delta?.amount ?? 0))
        return (
          <Panel key={metric} className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand">
              <WorkspaceIcon path={icon} className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                {metrics[metric]}
                <span
                  tabIndex={0}
                  className="group relative shrink-0 rounded-full border border-field-line px-1 text-[0.6rem] leading-3 text-muted"
                  aria-label={definition}
                >
                  i
                  <span className="pointer-events-none absolute z-10 mt-2 hidden w-40 rounded-lg bg-ink p-2 text-xs font-normal text-white shadow-panel group-hover:block group-focus-visible:block">
                    {definition}
                  </span>
                </span>
              </h2>
              <p className="my-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                {summary.current ? valueLabel(metric, summary.current[metric]) : '—'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {delta ? (
                  <>
                    <span title={prior ? periodLabel(prior) : undefined}>vs. prior period</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${direction < 0 ? 'bg-red-50 text-error' : direction > 0 ? 'bg-emerald-50 text-success' : 'bg-canvas text-nav'}`}
                    >
                      {delta.percent == null
                        ? valueLabel(metric, delta.amount)
                        : percentLabel(delta.percent)}
                    </span>
                  </>
                ) : (
                  'No comparable prior period'
                )}
              </div>
            </div>
          </Panel>
        )
      })}
    </section>
  )
}
