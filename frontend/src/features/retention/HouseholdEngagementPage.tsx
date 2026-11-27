import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getRetention, type RetentionHousehold } from '../../api/retention'
import { household360Path, retentionPath } from '../../app/workspaces'
import { Panel, PanelHeading } from '../../components/Panel'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import { segmentLabels } from '../customer-value/cohortQuery'
import { useRequest } from '../../api/useRequest'
import { ValueError, ValueLoading } from '../customer-value/ValueRequestState'
import { percent } from './engagement'

type HouseholdNavigation = {
  household?: RetentionHousehold
  asOf?: string
  horizon?: number
  returnTo?: string
}

export function HouseholdEngagementPage() {
  const { householdId } = useParams()
  const { state } = useLocation()
  const navigation = state as HouseholdNavigation | null
  const selected =
    navigation?.household?.household_id === householdId ? navigation?.household : undefined
  const load = useCallback((signal: AbortSignal) => getRetention({}, signal), [])
  const { result, retry } = useRequest(selected ? undefined : load)
  const row =
    selected ?? result?.data?.households.find((household) => household.household_id === householdId)
  const asOf = selected ? navigation?.asOf : result?.data?.as_of
  const horizon = selected ? navigation?.horizon : result?.data?.evidence.horizon_days

  return (
    <div className="space-y-4">
      <WorkspaceHeader path={household360Path} />
      <Link
        className="inline-block text-sm font-semibold text-link"
        to={navigation?.returnTo ?? retentionPath}
      >
        ← Back to Retention & Churn
      </Link>
      {!selected && !result && <ValueLoading label="Loading household" />}
      {result?.error && <ValueError message="Could not load household activity." retry={retry} />}
      {result?.data && !row && (
        <p className="text-sm text-muted">No recorded activity is available for this household.</p>
      )}
      {row && (
        <Panel aria-labelledby="household-engagement">
          <HouseholdEngagementDetails row={row} asOf={asOf} horizon={horizon} />
        </Panel>
      )}
    </div>
  )
}

export function HouseholdEngagementDetails({
  row,
  asOf,
  horizon,
}: {
  row: RetentionHousehold
  asOf?: string | null
  horizon?: number
}) {
  return (
    <>
      <PanelHeading
        id="household-engagement"
        title={`Household ${row.household_id}`}
        icon="/households"
        className="relative"
      >
        Review this household’s purchase activity and validated churn forecast, if available.
      </PanelHeading>
      {asOf && <p className="mt-2 text-sm text-muted">Observed as of {dateLabel(asOf)}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          ['Segment', segmentLabels[row.segment]],
          [
            'Last purchase',
            row.last_purchase ? dateLabel(row.last_purchase) : 'No purchase recorded',
          ],
          ['Days since purchase', row.recency_days ?? '—'],
          ['Purchase days · 180d', numberLabel(row.purchase_days_180d)],
          ['Net spend · 90d', moneyLabel(row.net_spend_90d)],
          [
            `Churn outlook${horizon ? ` · ${horizon} days` : ''}`,
            row.churn_risk == null ? 'Unavailable' : percent(row.churn_risk),
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-canvas p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
