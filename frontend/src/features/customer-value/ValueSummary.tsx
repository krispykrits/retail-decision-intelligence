import type { ModelSummary } from '../../api/customerValue'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { dateAfter, dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import { isAvailable, optionalMoney, statusLabels } from './valueDisplay'

export function ValueOverview({ summary }: { summary: ModelSummary }) {
  const { evidence } = summary
  const available = isAvailable(evidence)

  return (
    <Panel aria-labelledby="clv-overview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelHeading id="clv-overview" title="Cohort coverage" icon="wallet" />
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${available ? 'bg-success/10 text-success' : 'bg-canvas text-nav'}`}
        >
          {statusLabels[evidence.status]}
        </span>
      </div>
      {evidence.as_of && (
        <p className="mt-2 text-sm text-muted">
          Data through {dateLabel(evidence.as_of)}
          {available && (
            <>
              {' '}
              · Forecast period {dateAfter(evidence.as_of, 1)} –{' '}
              {dateAfter(evidence.as_of, evidence.horizon_days)}
            </>
          )}
        </p>
      )}
      {!available && <p className="mt-2 text-sm text-muted">{evidence.reason}</p>}
      {evidence.version && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Observed households', numberLabel(summary.observed_households)],
            ['Eligible households', numberLabel(summary.eligible_households)],
            ['Households scored', available ? numberLabel(summary.scored_households) : '—'],
            [
              'Mean predicted net spend',
              available ? optionalMoney(summary.mean_future_spend) : '—',
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-canvas p-3">
              <dt className="text-xs font-semibold text-nav">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  )
}

export function ValueDistribution({ summary }: { summary: ModelSummary }) {
  const bins = summary.distribution ?? []
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count))
  const regions = Object.entries(summary.regions ?? {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <Panel aria-labelledby="clv-distribution">
      <PanelHeading id="clv-distribution" title="Predicted spend distribution" icon="pie" />
      {!isAvailable(summary.evidence) ? (
        <p className="mt-3 text-sm text-muted">
          Forecast distribution requires an available model.
        </p>
      ) : bins.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No forecasts match this cohort.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            Households by projected net spend over the next {summary.evidence.horizon_days} days.
          </p>
          <ul className="mt-4 space-y-3">
            {bins.map((bin) => {
              const range =
                bin.lower === bin.upper
                  ? moneyLabel(bin.lower)
                  : `${moneyLabel(bin.lower)} – ${moneyLabel(bin.upper)}`
              return (
                <li key={bin.lower} className="grid gap-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <span>{range}</span>
                    <span className="font-semibold tabular-nums">{numberLabel(bin.count)}</span>
                  </div>
                  <progress
                    aria-label={`Households forecast at ${range}`}
                    value={bin.count}
                    max={maxCount}
                    className="h-2 w-full overflow-hidden rounded-full border-none bg-canvas [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-canvas [&::-webkit-progress-value]:bg-brand"
                  />
                </li>
              )
            })}
          </ul>
          {regions.length > 1 && (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-link">
                Compare by store region
              </summary>
              <DataTable
                className="mt-1"
                columns={{ region: 'Region', scored: 'Scored', average: 'Mean forecast' }}
              >
                {regions.map(([region, cohort]) => (
                  <tr key={region}>
                    <th scope="row">{region}</th>
                    <td>{numberLabel(cohort.scored_households)}</td>
                    <td>{optionalMoney(cohort.mean_future_spend)}</td>
                  </tr>
                ))}
              </DataTable>
            </details>
          )}
        </>
      )}
    </Panel>
  )
}
