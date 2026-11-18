import type { Dashboard, Metric, Point } from '../../api/dashboard'
import { Panel, PanelHeading } from '../../components/Panel'
import { TrendChart } from '../../components/TrendChart'
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
  function labelPoint(point: Point) {
    const { first_date: first, last_date: last } = coverage
    const start = first && point.start < first ? first : point.start
    const end = last && point.end > last ? last : point.end
    const days = (Date.parse(end) - Date.parse(start)) / millisecondsPerDay + 1
    const shortened = trend.grain === 'week' && days < 7
    return {
      index: point.index,
      start,
      value: Number(point.value),
      label: `${periodLabel({ start, end })}${shortened ? ` (${days} ${days === 1 ? 'day' : 'days'})` : ''}`,
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

  return (
    <Panel
      id="performance-trend"
      aria-labelledby="trend-title"
      className="scroll-mt-4"
      tabIndex={-1}
    >
      <div className="relative mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <PanelHeading id="trend-title" title="Performance trend" icon="/forecast">
            Groups matching transactions into days, seven-day windows, or months. The prior series
            uses the same filters over the equal-length period immediately before the selected
            dates.
          </PanelHeading>
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
        <div
          className={loading ? 'invisible' : error ? 'opacity-20' : undefined}
          inert={loading || error}
        >
          <TrendChart
            key={`${trend.metric}-${trend.current_period?.start}-${trend.current_period?.end}`}
            label={`${metrics[trend.metric]} by ${trend.grain}`}
            series={series}
            ticks={selectedPoints.map(({ index, start }) => ({
              index,
              label: axisDates.format(new Date(`${start}T00:00:00Z`)),
            }))}
            format={(value) => valueLabel(trend.metric, value)}
          />
          <p className="mt-2 text-xs text-muted">{comparisonNote}</p>
        </div>
        {loading ? (
          <div role="status" className="absolute inset-0 flex flex-col gap-2 py-2">
            <svg
              aria-hidden="true"
              className="min-h-0 w-full flex-1 motion-safe:animate-pulse"
              viewBox="0 0 480 190"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                className="stroke-line"
                d="M40 20H466 M40 55H466 M40 90H466 M40 125H466 M40 160H466"
                strokeWidth="2"
              />
              <path className="stroke-field-line" d="M40 20V160H466" strokeWidth="1.5" />
              <path
                className="stroke-brand/45"
                d="M40 132L93 110L146 119L199 78L252 92L305 62L358 78L411 44L466 53"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                className="stroke-line"
                d="M6 20H28 M6 55H28 M6 90H28 M6 125H28 M6 160H28 M40 177H79 M167 177H206 M296 177H335 M427 177H466"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs text-muted">Updating trend…</span>
          </div>
        ) : (
          error && (
            <div
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink"
              role="alert"
            >
              Trend couldn’t load.
              <button type="button" className="font-semibold text-link underline" onClick={retry}>
                Retry
              </button>
            </div>
          )
        )}
      </div>
    </Panel>
  )
}
