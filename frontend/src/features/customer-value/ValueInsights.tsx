import type { ModelSummary } from '../../api/customerValue'
import { Panel, PanelHeading } from '../../components/Panel'
import { moneyLabel, numberLabel } from '../../lib/format'
import { isAvailable } from './valueDisplay'

export function ValueInsights({ summary }: { summary: ModelSummary }) {
  const recent = summary.historical_spend?.at(-1)
  const prior = summary.historical_spend?.at(-2)
  const change = recent && prior ? Number(recent.net_spend) - Number(prior.net_spend) : null
  const missing = summary.observed_households - summary.scored_households

  const canExplore = isAvailable(summary.evidence) && summary.observed_households > 0
  if (change === null && !canExplore) return null

  return (
    <Panel aria-labelledby="clv-insights">
      <PanelHeading id="clv-insights" title="Key insights" icon="checklist" />
      <ul className="mt-3 space-y-2 text-sm">
        {change !== null && (
          <li className="rounded-lg bg-canvas p-3">
            <strong>Recent spending</strong>
            <p className="mt-1 text-muted">
              {change === 0
                ? 'Total spending was the same as in the previous 90 days.'
                : `Total spending was ${moneyLabel(Math.abs(change))} ${change > 0 ? 'higher' : 'lower'} than in the previous 90 days.`}
            </p>
          </li>
        )}
        {canExplore && (
          <li className="rounded-lg bg-canvas p-3">
            <strong>Where to look next</strong>
            <p className="mt-1 text-muted">
              Open a household in the list to compare its recent spending and forecast.
              {missing > 0 && ` ${numberLabel(missing)} households in this view have no forecast.`}
            </p>
          </li>
        )}
      </ul>
    </Panel>
  )
}
