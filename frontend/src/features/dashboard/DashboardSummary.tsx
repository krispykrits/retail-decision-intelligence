import type { Dashboard, Metric } from '../../api/dashboard'
import { Panel } from '../../components/Panel'
import { dateLabel, metrics, percentLabel, valueLabel } from './format'

const cards = [
  ['spend', 'Sales less returns and adjustments.'],
  ['households', 'Unique households with a positive-unit purchase.'],
  ['avg_basket', 'Net spend divided by distinct baskets, including returns.'],
  ['units', 'Units purchased less returned units.'],
] satisfies [Metric, string][]

export function DashboardSummary({ summary }: { summary: Dashboard['summary'] }) {
  const inactivity = summary.inactivity
  return (
    <section aria-label="Retail metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([metric, description]) => {
        const delta = summary.changes[metric]
        return (
          <Panel key={metric} className="flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-nav">{metrics[metric]}</h2>
              <p className="my-1 text-2xl font-semibold tracking-tight tabular-nums">
                {summary.current ? valueLabel(metric, summary.current[metric]) : '—'}
              </p>
              <p className="min-h-8 text-xs text-muted">{description}</p>
            </div>
            <p className="mt-3 border-t border-line pt-2 text-xs font-medium text-nav">
              {delta ? (
                <>
                  <span
                    className={
                      Number(delta.amount) < 0
                        ? 'text-error'
                        : Number(delta.amount) > 0
                          ? 'text-success'
                          : ''
                    }
                  >
                    {delta.percent == null
                      ? valueLabel(metric, delta.amount)
                      : percentLabel(delta.percent)}
                  </span>
                  {' vs. prior period'}
                </>
              ) : (
                'No comparable prior period'
              )}
            </p>
          </Panel>
        )
      })}
      <Panel className="flex flex-col justify-between">
        <div>
          <h2 className="text-sm font-semibold text-nav">Observed inactive households</h2>
          <p className="my-1 text-2xl font-semibold tracking-tight tabular-nums">
            {inactivity ? valueLabel('households', inactivity.inactive) : '—'}
          </p>
          <p className="text-xs text-muted">
            {inactivity
              ? `Last purchase at least ${inactivity.days} days ago, as of ${dateLabel(inactivity.as_of)}.`
              : 'A full inactivity lookback and observed purchases are required.'}
          </p>
        </div>
        <p className="mt-3 border-t border-line pt-2 text-xs font-medium text-nav">
          {inactivity
            ? `Of ${valueLabel('households', inactivity.eligible)} observed purchasing households`
            : 'Insufficient source history'}
        </p>
      </Panel>
    </section>
  )
}
