import type { AccuracyOverview, HorizonAccuracy } from '../../api/forecastAccuracy'
import { DataTable } from '../../components/DataTable'
import { InfoTooltip } from '../../components/InfoTooltip'
import { Panel, PanelHeading } from '../../components/Panel'
import { TrendChart } from '../../components/TrendChart'
import { Icon } from '../../components/WorkspaceIcon'
import { dateAfter, dateLabel, numberLabel } from '../../lib/format'
import { Link, useLocation } from 'react-router-dom'
import { forecastEvidencePath } from '../../app/workspaces'

import { horizonLabels } from './horizons'

const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const units = (value: number) => oneDecimal.format(value)
const percent = (value: number) => `${oneDecimal.format(value)}%`
const displayDate = (date?: string | null) => (date ? dateLabel(date) : '—')

function comparison(result: HorizonAccuracy) {
  const change = result.average_miss - result.baseline_average_miss
  if (Math.abs(change) < 0.05) return 'About the same'
  return change < 0 ? 'Beat simple forecast' : 'Simple forecast did better'
}

export function PurchaseHistory({ data }: { data: AccuracyOverview }) {
  const coverage = data.coverage
  const rows = [
    ['First purchase date', displayDate(coverage.first_purchase)],
    ['Last purchase date', displayDate(coverage.last_purchase)],
    ['Complete weeks', numberLabel(coverage.complete_weeks)],
    [
      data.commodity ? `Weeks with ${data.commodity} purchases` : 'Weeks with commodity purchases',
      `${numberLabel(coverage.weeks_with_purchases)} / ${numberLabel(coverage.complete_weeks)}`,
    ],
  ]

  return (
    <Panel aria-labelledby="forecast-history">
      <PanelHeading
        id="forecast-history"
        title="Purchase history available"
        icon="/data"
        className="relative"
      >
        Shows recorded purchases for the selected region and how many complete weeks included a
        purchase of the selected commodity.
      </PanelHeading>
      {coverage.first_purchase ? (
        <>
          <dl className="mt-3 divide-y divide-line text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2">
                <dt>{label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-muted">
            {coverage.first_complete_week && coverage.last_complete_week_end
              ? `Complete weeks: ${dateLabel(coverage.first_complete_week)} – ${dateLabel(coverage.last_complete_week_end)}`
              : 'This selection has no complete weeks.'}
          </p>
          <p className="mt-3 text-sm text-muted">
            Partial weeks at the start and end are excluded.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">No purchases are recorded for this selection.</p>
      )}
    </Panel>
  )
}

const chartLines = [
  { id: 'actual', label: 'Actual demand', color: 'text-brand', dashed: false },
  { id: 'forecast', label: 'Forecast', color: 'text-violet-700', dashed: true },
  { id: 'baseline', label: 'Simple forecast', color: 'text-muted', dashed: true },
] as const

export function ForecastComparison({
  commodity,
  result,
  observed,
  empty,
}: {
  commodity?: string | null
  result?: HorizonAccuracy
  observed: AccuracyOverview['observed']
  empty: string
}) {
  const points = result?.points ?? []
  const hasForecasts = points.length > 0
  const chartWeeks = hasForecasts ? points : observed
  const firstWeek = chartWeeks[0]?.week_start
  const startTime = firstWeek ? Date.parse(firstWeek) : 0
  const ticks = chartWeeks.map((point) => ({
    index: (Date.parse(point.week_start) - startTime) / (7 * 24 * 60 * 60 * 1000),
    label: dateLabel(point.week_start),
  }))
  const lines = hasForecasts ? chartLines : chartLines.slice(0, 1)
  const series = lines.map((line) => ({
    ...line,
    points: ticks.map((tick, index) => ({
      ...tick,
      value: hasForecasts ? points[index][line.id] : observed[index].units,
    })),
  }))
  const first = points[0]
  const last = points.at(-1)

  return (
    <Panel className="flex flex-col" aria-labelledby="forecast-comparison">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeading
          id="forecast-comparison"
          title={`${hasForecasts ? 'Forecast vs. actual demand' : 'Recorded weekly demand'}${commodity ? ` · ${commodity}` : ''}`}
          icon="/forecast"
          className="relative"
        >
          {hasForecasts
            ? 'Compare recorded weekly net units with both forecasts for the same weeks.'
            : 'Recorded weekly units after returns and adjustments. Weeks without commodity records are left blank.'}
        </PanelHeading>
        <ul className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Chart legend">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center gap-1.5">
              <span
                className={`w-4 border-t-2 ${line.dashed ? 'border-dashed' : ''} ${line.color}`}
              />
              {line.label}
            </li>
          ))}
        </ul>
      </div>
      {chartWeeks.length ? (
        <TrendChart
          label={hasForecasts ? 'Actual demand and forecasts by week' : 'Recorded demand by week'}
          series={series}
          ticks={ticks}
          format={(value) => `${units(value)} units`}
        />
      ) : (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <Icon name="/forecast" className="size-12 text-muted/60" />
          <p className="font-semibold">{empty}</p>
          <p className="text-sm text-muted">
            See how forecasts compared with actual demand in past weeks.
          </p>
        </div>
      )}
      {hasForecasts && (
        <dl className="mt-3 grid gap-3 rounded-lg bg-canvas p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Weeks compared</dt>
            <dd className="mt-1 font-semibold">
              {first && last
                ? `${dateLabel(first.week_start)} – ${dateAfter(last.week_start, 6)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Weeks tested</dt>
            <dd className="mt-1 font-semibold">
              {result ? numberLabel(result.weeks_tested) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last forecast cutoff</dt>
            <dd className="mt-1 font-semibold">{displayDate(last?.forecast_cutoff)}</dd>
          </div>
        </dl>
      )}
    </Panel>
  )
}

export function AccuracyTable({
  results,
  horizon,
}: {
  results: HorizonAccuracy[]
  horizon: number
}) {
  return (
    <Panel aria-labelledby="accuracy-scores">
      <PanelHeading
        id="accuracy-scores"
        title="How accurate was each forecast?"
        icon="calculator"
        className="relative"
      >
        Each row compares both forecasts against the same actual weeks. Smaller errors mean closer
        predictions.
      </PanelHeading>
      <p className="mt-2 text-sm text-muted">
        Compare the forecast with a simple forecast based on past patterns.
      </p>
      <DataTable
        className="mt-0 min-w-140"
        viewportClassName="mt-3"
        viewportLabel="Accuracy by look-ahead"
        columns={{
          horizon: 'How far ahead',
          miss: (
            <span className="relative flex items-center gap-1">
              Average miss (units)
              <InfoTooltip label="Average miss">
                The typical size of a miss, in units per week. A miss above or below actual demand
                counts the same.
              </InfoTooltip>
            </span>
          ),
          baseline: 'Simple forecast’s average miss (units)',
          error: (
            <span className="relative flex items-center gap-1">
              Overall error (%)
              <InfoTooltip label="Overall error">
                Total missed units divided by total absolute actual units across the tested weeks.
                If actual units are all zero, this percentage is unavailable.
              </InfoTooltip>
            </span>
          ),
          weeks: 'Weeks tested',
          result: 'Result',
        }}
      >
        {horizonLabels.map(({ weeks, label }) => {
          const result = results.find((item) => item.horizon === weeks)
          return (
            <tr key={weeks} className={weeks === horizon ? 'bg-nav-selected/50' : undefined}>
              <th scope="row" className="font-semibold whitespace-nowrap">
                {label}
              </th>
              <td>{result ? units(result.average_miss) : '—'}</td>
              <td>{result ? units(result.baseline_average_miss) : '—'}</td>
              <td>
                {result?.overall_error_percent != null
                  ? percent(result.overall_error_percent)
                  : '—'}
              </td>
              <td>{result ? numberLabel(result.weeks_tested) : '—'}</td>
              <td>{result ? comparison(result) : 'Not checked'}</td>
            </tr>
          )
        })}
      </DataTable>
    </Panel>
  )
}

export function Usability({
  check,
  result,
  notice,
}: {
  check: AccuracyOverview['selected']
  result?: HorizonAccuracy
  notice: string
}) {
  const { search } = useLocation()
  return (
    <Panel aria-labelledby="forecast-usability">
      <PanelHeading
        id="forecast-usability"
        title="Can I use this forecast?"
        icon="checklist"
        className="relative"
      >
        See how the forecast performed against a simple alternative in past weeks at the chosen
        look-ahead.
      </PanelHeading>
      <p
        className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${result && comparison(result) === 'Beat simple forecast' ? 'bg-success/10 text-success' : 'bg-canvas text-nav'}`}
      >
        {result ? comparison(result) : 'Not assessed'}
      </p>
      <p className="mt-2 text-sm text-muted">
        {result
          ? `At this look-ahead, the forecast missed by ${units(result.average_miss)} units per week on average across ${numberLabel(result.weeks_tested)} tested weeks. The simple forecast missed by ${units(result.baseline_average_miss)} units. Future accuracy can differ.`
          : notice}
      </p>
      <Link
        to={{ pathname: forecastEvidencePath, search }}
        className="mt-3 inline-block rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-nav-hover"
      >
        View Forecast Evidence <span aria-hidden="true">→</span>
      </Link>
      <details className="mt-4 border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Technical details</summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>
            <strong>MAE</strong> is the mean absolute error in net units. <strong>WAPE</strong>{' '}
            divides summed absolute error by summed absolute actual units. WAPE is unavailable when
            that denominator is zero.
          </p>
          <p>
            <strong>sMAPE</strong> averages the symmetric percentage error across tested weeks. A
            week with both values equal to zero contributes zero.
          </p>
          <p>
            Net units include signed adjustments. Weeks run Monday through Sunday. Within weeks with
            recorded regional activity, a commodity with no transactions has zero recorded units.
          </p>
          <p>
            Rolling-origin tests train a separate ridge regression for each look-ahead using only
            data through each cutoff. The simple forecast uses recorded net units 52 weeks earlier.
          </p>
          {check && (
            <p>
              Model {check.model_version} · Transaction revision {check.transaction_version} ·
              Product revision {check.product_version} · Checked {dateLabel(check.checked_at)}
            </p>
          )}
          {result && (
            <>
              <p>
                Training history used across cutoffs: {dateLabel(result.first_training_week)} –{' '}
                {dateLabel(result.last_training_week_end)}. Each fit used{' '}
                {result.training_samples_min}–{result.training_samples_max} training samples. Each
                forecast was evaluated on {result.weeks_tested} target weeks.
              </p>
              <p>
                Forecast / simple forecast WAPE:{' '}
                {result.overall_error_percent == null ||
                result.baseline_overall_error_percent == null
                  ? 'Unavailable'
                  : `${percent(result.overall_error_percent)} / ${percent(result.baseline_overall_error_percent)}`}
                . sMAPE: {percent(result.symmetric_error_percent)} /{' '}
                {percent(result.baseline_symmetric_error_percent)}.
              </p>
            </>
          )}
          <p>Uncertainty intervals are unavailable for this check method.</p>
        </div>
      </details>
    </Panel>
  )
}
