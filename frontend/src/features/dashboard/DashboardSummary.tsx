import type { Dashboard, Metric } from '../../api/dashboard'
import type { Workspace } from '../../app/workspaces'
import { InfoTooltip } from '../../components/InfoTooltip'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { metrics, percentLabel, periodLabel, valueLabel } from './format'

const cards: { metric: Metric; icon: Workspace['path']; definition: string }[] = [
  {
    metric: 'spend',
    icon: '/merchandise',
    definition: 'Adds signed spend for matching transactions, including returns and adjustments.',
  },
  {
    metric: 'baskets',
    icon: '/baskets',
    definition:
      'Counts distinct basket IDs on matching transaction lines. Multiple lines in a basket count once.',
  },
  {
    metric: 'households',
    icon: '/customers',
    definition:
      'Counts each household once if it has at least one matching transaction with a positive unit count.',
  },
  {
    metric: 'avg_basket',
    icon: '/command-center',
    definition: 'Divides net spend by the number of distinct baskets in the selection.',
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
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand">
              <WorkspaceIcon path={icon} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="relative flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-ink">{metrics[metric]}</h2>
                <InfoTooltip label={metrics[metric]}>
                  {`${definition} The prior period covers the same number of days immediately before the selected dates.`}
                </InfoTooltip>
              </div>
              <p className="mt-1 text-2xl leading-tight font-semibold tracking-tight tabular-nums 2xl:text-3xl">
                {summary.current ? valueLabel(metric, summary.current[metric]) : '—'}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted">
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
