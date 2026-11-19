import type { ModelSummary } from '../../api/customerValue'
import { Panel, PanelHeading } from '../../components/Panel'
import { moneyLabel, numberLabel } from '../../lib/format'
import { loyaltyLabel, spendingSegments } from './valueDisplay'

export function ValueSegments({ summary }: { summary: ModelSummary }) {
  const segments = spendingSegments(summary)
  const max = Math.max(1, ...segments.map(({ average }) => Math.abs(average)))

  return (
    <Panel aria-labelledby="clv-segments" className="h-full">
      <PanelHeading id="clv-segments" title="Observed spend by segment" icon="/customers" />
      <p className="mt-2 text-sm text-muted">
        Average per household in the last 90 days, grouped by loyalty membership.
      </p>
      {segments.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {segments.map(({ loyalty_flag, households, average }) => {
            const label = loyaltyLabel(loyalty_flag)
            return (
              <li key={loyalty_flag ?? 'none'}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span>
                    {label} <span className="text-xs text-muted">({numberLabel(households)})</span>
                  </span>
                  <span className="font-semibold">{moneyLabel(average)}</span>
                </div>
                <progress
                  aria-label={`${label} average net spend magnitude`}
                  max={max}
                  value={Math.abs(average)}
                  className="block h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-canvas [&::-webkit-progress-value]:bg-brand"
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No segment spending is available for this selection.
        </p>
      )}
    </Panel>
  )
}
