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
    <Panel aria-labelledby="clv-history" className="h-full">
      <PanelHeading id="clv-history" title="Historical household value trend" icon="/forecast" />
      {points.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Recorded net spend · {dateLabel(periods[0].start)} –{' '}
            {dateLabel(periods[periods.length - 1].end)}
            <span className="block text-xs">Each point covers 90 days.</span>
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
        <p className="mt-2 text-sm text-muted">{emptyMessage(summary)}</p>
      )}
    </Panel>
  )
}

function emptyMessage(summary: ModelSummary) {
  if (summary.historical_spend === undefined) return 'Spending history needs a newer app version.'
  if (summary.evidence.status === 'stale')
    return 'Spending history is paused because the source data changed.'
  if (!summary.evidence.version) return 'Spending history will appear after the first model run.'
  if (!summary.observed_households) return 'No households match your filters.'
  return 'There are fewer than 90 days of recorded spending.'
}
