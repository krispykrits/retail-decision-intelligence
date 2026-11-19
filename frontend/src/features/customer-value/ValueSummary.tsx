import type { ModelSummary } from '../../api/customerValue'
import { InfoTooltip } from '../../components/InfoTooltip'
import { Panel, PanelHeading } from '../../components/Panel'
import { Icon, type IconName } from '../../components/WorkspaceIcon'
import { dateAfter, dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import { isAvailable, observedChange, optionalMoney, statusLabels } from './valueDisplay'

export function ValueOverview({ summary }: { summary: ModelSummary }) {
  const ready = isAvailable(summary.evidence)
  const recent = summary.historical_spend?.at(-1)
  const average =
    recent && summary.observed_households
      ? Number(recent.net_spend) / summary.observed_households
      : null
  const stats: [string, string, IconName, string, ReturnType<typeof observedChange>?][] = [
    [
      'Households',
      summary.evidence.version ? numberLabel(summary.observed_households) : '—',
      '/customers',
      'Number of households that match the filters. Some households may have no forecast.',
    ],
    [
      'Observed spend · last 90 days',
      optionalMoney(recent?.net_spend),
      'wallet',
      'Total these households spent in the 90 days shown, after returns.',
      observedChange(summary),
    ],
    [
      'Average per household · last 90 days',
      optionalMoney(average),
      'calculator',
      'Total spending after returns divided by the number of households in view. Households that did not spend are included.',
    ],
    [
      'Forecast status',
      ready ? 'Ready' : statusLabels[summary.evidence.status],
      '/forecast',
      'Shows whether the 90-day forecast is ready to use or needs to be updated.',
    ],
  ]

  return (
    <Panel aria-labelledby="clv-overview">
      <PanelHeading
        id="clv-overview"
        title="Customer Value (CLV)"
        icon="wallet"
        helpLabel="the Customer Value overview"
        className="relative"
      >
        Compare what the households in view actually spent with what they are expected to spend
        next.
      </PanelHeading>
      <p className="mt-1.5 text-sm text-muted">
        See what households spent and what they are expected to spend over the next 90 days.
      </p>
      {recent && (
        <p className="mt-1 text-xs text-muted">
          Observed spending · {dateLabel(recent.start)} – {dateLabel(recent.end)}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(([label, value, icon, help, change]) => (
          <div
            key={label}
            className="flex items-start gap-2 rounded-xl border border-line bg-canvas p-3 sm:items-center sm:gap-3"
          >
            <Icon
              name={icon}
              className="hidden size-8 rounded-lg bg-nav-selected p-1.5 text-brand sm:block"
            />
            <div>
              <dt className="relative flex items-center gap-1.5 text-xs font-semibold text-nav">
                {label}
                <InfoTooltip label={label}>{help}</InfoTooltip>
              </dt>
              <dd className="mt-1 text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl">
                {value}
              </dd>
              {change && (
                <dd className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>vs. prior 90 days</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${change.amount > 0 ? 'bg-emerald-50 text-success' : change.amount < 0 ? 'bg-red-50 text-error' : 'bg-surface text-nav'}`}
                  >
                    {change.amount > 0 && '+'}
                    {change.percent === null
                      ? moneyLabel(change.amount)
                      : `${change.percent.toFixed(1)}%`}
                  </span>
                </dd>
              )}
            </div>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

export function ValueOutlook({ summary }: { summary: ModelSummary }) {
  const { evidence } = summary
  const bins = summary.distribution ?? []
  const largestBin = Math.max(1, ...bins.map((bin) => bin.count))

  return (
    <Panel aria-labelledby="clv-outlook" className="h-full">
      <PanelHeading id="clv-outlook" title="90-day outlook" icon="/forecast" className="relative">
        See how much households with a forecast are expected to spend in the 90 days shown. The
        figures are estimates.
      </PanelHeading>
      {isAvailable(evidence) && evidence.as_of && summary.scored_households > 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Forecast period · {dateAfter(evidence.as_of, 1)} –{' '}
            {dateAfter(evidence.as_of, evidence.horizon_days)}
          </p>
          <dl className="mt-3 divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-2 py-2">
              <dt>Average expected spend</dt>
              <dd className="font-semibold">{optionalMoney(summary.mean_future_spend)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-2">
              <dt>Households with a forecast</dt>
              <dd className="font-semibold">{numberLabel(summary.scored_households)}</dd>
            </div>
          </dl>
          {bins.length > 0 && (
            <details className="mt-2 border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-link">
                View spending ranges
              </summary>
              <ul className="mt-3 space-y-2.5">
                {bins.map(({ lower, upper, count }) => {
                  const range =
                    lower === upper
                      ? moneyLabel(lower)
                      : `${moneyLabel(lower)} – ${moneyLabel(upper)}`
                  return (
                    <li key={lower} className="grid gap-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span>{range}</span>
                        <span className="font-semibold tabular-nums">{numberLabel(count)}</span>
                      </div>
                      <progress
                        aria-label={`Households forecast at ${range}`}
                        max={largestBin}
                        value={count}
                        className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-canvas [&::-webkit-progress-value]:bg-brand"
                      />
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          {evidence.status === 'stale'
            ? 'New data is available. Forecasts are due for a refresh.'
            : isAvailable(evidence)
              ? 'No forecasts match your filters.'
              : 'Spending forecasts are unavailable.'}
        </p>
      )}
    </Panel>
  )
}
