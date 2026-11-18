import type { Dashboard, Metric, Point } from '../../api/dashboard'
import { Panel } from '../../components/Panel'
import { TrendChart } from '../../components/TrendChart'
import { dateLabel, metrics, periodLabel, valueLabel } from './format'

export function DashboardTrend({
  trend,
  onMetricChange,
}: {
  trend: Dashboard['trend']
  onMetricChange: (metric: Metric) => void
}) {
  const labelPoint = (point: Point) => ({
    index: point.index,
    value: Number(point.value),
    label: periodLabel(point),
  })
  const available = trend.current.length ? trend.current : trend.prior
  const indices = [...new Set([0, Math.floor(available.length / 2), available.length - 1])].filter(
    (index) => index >= 0 && index < available.length,
  )

  const series = [
    {
      id: 'prior',
      label: `Prior period${trend.prior_period?.partial ? ' (partial)' : ''}`,
      points: trend.prior.map(labelPoint),
      dashed: true,
    },
    {
      id: 'current',
      label: `Selected period${trend.current_period?.partial ? ' (partial)' : ''}`,
      points: trend.current.map(labelPoint),
    },
  ].filter((line) => line.points.length > 0)

  return (
    <Panel
      id="performance-trend"
      aria-labelledby="trend-title"
      className="scroll-mt-4"
      tabIndex={-1}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="trend-title" className="font-semibold">
            Performance trend
          </h2>
          <p className="text-sm text-muted">
            {{ day: 'Daily', week: 'Seven-day', month: 'Monthly' }[trend.grain]} totals
          </p>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-nav">
          Trend metric
          <select
            className="rounded-lg border border-field-line bg-surface px-2 py-1.5 text-sm"
            value={trend.metric}
            onChange={(event) => onMetricChange(event.target.value as Metric)}
          >
            {Object.entries(metrics).map(([key, title]) => (
              <option value={key} key={key}>
                {title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TrendChart
        key={`${trend.metric}-${trend.current_period?.start}-${trend.current_period?.end}`}
        label={`${metrics[trend.metric]} by ${trend.grain}`}
        series={series}
        ticks={indices.map((index) => ({
          index: available[index].index,
          label: dateLabel(available[index].start),
        }))}
        format={(value) => valueLabel(trend.metric, value)}
      />
    </Panel>
  )
}
