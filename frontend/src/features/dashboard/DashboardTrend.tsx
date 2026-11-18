import type { Dashboard, Metric, Point } from '../../api/dashboard'
import { Panel } from '../../components/Panel'
import { Spinner } from '../../components/Spinner'
import { TrendChart } from '../../components/TrendChart'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { metrics, periodLabel, valueLabel } from './format'

const axisDates = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const millisecondsPerDay = 86_400_000

export function DashboardTrend({
  trend,
  coverage,
  metric,
  loading,
  error,
  retry,
  onMetricChange,
}: {
  trend: Dashboard['trend']
  coverage: Dashboard['options']
  metric: Metric
  loading: boolean
  error: boolean
  retry: () => void
  onMetricChange: (metric: Metric) => void
}) {
  function observedBucket(point: Point) {
    const { first_date: first, last_date: last } = coverage
    const start = first && point.start < first ? first : point.start
    const end = last && point.end > last ? last : point.end
    return { ...point, start, end }
  }

  function labelPoint(point: Point) {
    const bucket = observedBucket(point)
    const days = (Date.parse(bucket.end) - Date.parse(bucket.start)) / millisecondsPerDay + 1
    const shortened = trend.grain === 'week' && days < 7
    return {
      index: point.index,
      value: Number(point.value),
      label: `${periodLabel(bucket)}${shortened ? ` (${days} ${days === 1 ? 'day' : 'days'})` : ''}`,
      shortened,
    }
  }

  const priorPeriod = trend.prior_period
  const canCompare =
    Boolean(trend.current_period && !trend.current_period.partial) &&
    Boolean(priorPeriod && !priorPeriod.partial) &&
    trend.prior.length > 0
  const selectedPoints = trend.current.map(labelPoint)
  const priorPoints = canCompare ? trend.prior.map(labelPoint) : []
  const series = [
    { id: 'prior', label: 'Prior period', points: priorPoints, dashed: true },
    { id: 'current', label: 'Selected period', points: selectedPoints },
  ].filter((line) => line.points.length > 0)
  const comparisonNote =
    canCompare && priorPeriod
      ? `Compared with ${periodLabel(priorPeriod)}.`
      : !trend.current_period?.partial && priorPeriod?.partial
        ? 'The prior period extends beyond the imported dates.'
        : 'A comparable prior period is unavailable.'
  const hasShortWeek = [...selectedPoints, ...priorPoints].some((point) => point.shortened)

  return (
    <Panel
      id="performance-trend"
      aria-labelledby="trend-title"
      className="scroll-mt-4"
      tabIndex={-1}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="trend-title" className="flex items-center gap-2 font-semibold">
            <WorkspaceIcon path="/forecast" className="size-5 text-brand" />
            Performance trend
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {{ day: 'Daily', week: 'Seven-day', month: 'Monthly' }[trend.grain]} totals
          </p>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-nav">
          Trend metric
          <select
            className="rounded-lg border border-field-line bg-surface px-2 py-1.5 text-sm"
            value={metric}
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
      <div className="relative min-h-48" aria-busy={loading}>
        <div className={loading || error ? 'opacity-20' : undefined} inert={loading || error}>
          <TrendChart
            key={`${trend.metric}-${trend.current_period?.start}-${trend.current_period?.end}`}
            label={`${metrics[trend.metric]} by ${trend.grain}`}
            series={series}
            ticks={trend.current.map(observedBucket).map(({ index, start }) => ({
              index,
              label: axisDates.format(new Date(`${start}T00:00:00Z`)),
            }))}
            format={(value) => valueLabel(trend.metric, value)}
          />
          <p className="mt-2 text-xs text-muted">
            {comparisonNote}
            {hasShortWeek && ' Short weeks show their day count in the chart details.'}
          </p>
        </div>
        {(loading || error) && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink"
            role={error ? 'alert' : 'status'}
          >
            {error ? (
              <>
                Trend couldn’t load.
                <button type="button" className="font-semibold text-link underline" onClick={retry}>
                  Retry
                </button>
              </>
            ) : (
              <>
                <Spinner /> Updating trend…
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
