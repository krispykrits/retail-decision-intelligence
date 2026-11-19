import type { ModelSummary } from '../../api/customerValue'
import { Panel, PanelHeading } from '../../components/Panel'
import { moneyLabel, numberLabel } from '../../lib/format'
import { segmentLabels } from './cohortQuery'
import { spendingSegments } from './valueDisplay'

export function ValueSegments({ summary }: { summary: ModelSummary }) {
  const segments = spendingSegments(summary)
  const max = Math.max(1, ...segments.map(({ average }) => Math.abs(average)))

  return (
    <Panel aria-labelledby="clv-segments" className="h-full">
      <PanelHeading
        id="clv-segments"
        title="Observed spend by customer segment"
        icon="/customers"
        className="relative"
      >
        Groups use shopping activity in the 90 days before the model’s most recent observed period.
        Higher-spend households are positive-spend shoppers in the top quarter. Among the rest,
        frequent shoppers purchased on six or more days and infrequent shoppers on one or two days.
        All remaining households are grouped as Other.
      </PanelHeading>
      <p className="mt-2 text-sm text-muted">
        Average net spend per household in the 90 days ending at the forecast cutoff.
      </p>
      {segments.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {segments.map(({ segment, households, average }) => {
            const label = segmentLabels[segment]
            return (
              <li key={segment}>
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
