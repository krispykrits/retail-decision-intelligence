import type { ModelSummary } from '../../api/customerValue'
import { Panel, PanelHeading } from '../../components/Panel'
import { TrendChart } from '../../components/TrendChart'
import { dateLabel, moneyLabel } from '../../lib/format'

const month = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function HistoricalSpendTrend({ summary }: { summary: ModelSummary }) {
  const periods = summary.historical_spend ?? []
  const points = periods.map(({ start, end, net_spend }, index) => ({
    index,
    value: Number(net_spend),
    label: `${dateLabel(start)} – ${dateLabel(end)}`,
  }))

  return (
    <Panel aria-labelledby="clv-history">
      <PanelHeading id="clv-history" title="Historical household value trend" icon="/forecast" />
      {points.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Recorded net spend for the selected households in complete 90-day periods.
          </p>
          <div className="mt-3">
            <TrendChart
              label="Observed household net spend by 90-day period"
              series={[{ id: 'observed', label: 'Observed net spend', points }]}
              ticks={periods.map(({ end }, index) => ({
                index,
                label: month.format(new Date(`${end}T00:00:00Z`)),
              }))}
              format={moneyLabel}
            />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          {summary.evidence.status === 'stale'
            ? 'Refresh the model run to reconcile this cohort with the current transactions.'
            : 'No complete 90-day history is available for this cohort.'}
        </p>
      )}
    </Panel>
  )
}
