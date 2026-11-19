import type { ModelSummary } from '../../api/customerValue'
import { Panel, PanelHeading } from '../../components/Panel'
import { moneyLabel, numberLabel } from '../../lib/format'
import { loyaltyLabel, spendingGroups } from './valueDisplay'

export function ValueSegments({ summary }: { summary: ModelSummary }) {
  const segments = spendingGroups(summary)
  const membership = summary.loyalty_filter
  const member = segments.find(({ key }) => key === 'Y')
  const nonMember = segments.find(({ key }) => key === 'N')
  const max = Math.max(1, ...segments.map(({ average }) => Math.abs(average)))

  return (
    <Panel aria-labelledby="clv-segments" className="h-full">
      <PanelHeading
        id="clv-segments"
        title={
          membership ? 'Observed spend by customer segment' : 'Observed spend by loyalty membership'
        }
        icon="/customers"
        className="relative"
      >
        {membership
          ? 'Groups are based on shopping habits in the 90 days before the period shown. The top spenders form one group. Among the rest, those who shopped on six or more days are frequent shoppers, those who shopped on one or two days are infrequent shoppers, and the rest are grouped as Other.'
          : 'Compare what members and non-members spent per household, after returns. Households without a recorded membership are shown separately.'}
      </PanelHeading>
      <p className="mt-2 text-sm text-muted">
        Average spend per household in the 90 days before the forecast starts.
        {membership && ` Showing ${loyaltyLabel(membership).toLowerCase()} only.`}
      </p>
      {segments.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {segments.map(({ key, label, households, average }) => {
            return (
              <li key={key}>
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
      {member && nonMember && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          {member.average === nonMember.average
            ? 'Members and non-members spent the same amount per household.'
            : `Members spent ${moneyLabel(Math.abs(member.average - nonMember.average))} ${member.average > nonMember.average ? 'more' : 'less'} per household than non-members.`}
        </p>
      )}
    </Panel>
  )
}
