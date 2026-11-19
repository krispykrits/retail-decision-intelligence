import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getHouseholdValue } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { Panel, PanelHeading } from '../../components/Panel'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { dateAfter, dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import { forecastLabel, isAvailable, optionalMoney, statusLabels } from './valueDisplay'
import { ValueError, ValueLoading } from './ValueRequestState'
import { useValueRequest } from './useValueRequest'

export function HouseholdValuePage() {
  const { householdId = '' } = useParams()
  const { search } = useLocation()
  const load = useCallback(
    (signal: AbortSignal) => getHouseholdValue(householdId, signal),
    [householdId],
  )
  const { result, retry } = useValueRequest(load)
  const detail = result?.data

  return (
    <div className="space-y-4">
      <WorkspaceHeader path={customerIntelligencePath} />
      <Link
        className="inline-block text-sm font-semibold"
        to={{ pathname: customerIntelligencePath, search }}
      >
        ← Back to Customer Value
      </Link>
      {!result && <ValueLoading label="Loading household value" />}
      {result?.error && <ValueError message="Could not load this household." retry={retry} />}
      {detail && (
        <Panel aria-labelledby="clv-household-detail">
          <PanelHeading
            id="clv-household-detail"
            title={`Household ${detail.household_id}`}
            icon="/customers"
          />
          <p className="mt-2 text-sm text-muted">
            Model status: {statusLabels[detail.clv.status]}
            {detail.clv.as_of && ` · Data through ${dateLabel(detail.clv.as_of)}`}
          </p>

          {detail.future_spend ? (
            <dl className="mt-4 grid gap-x-3 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                [
                  'Observed spend · last 90 days',
                  optionalMoney(detail.future_spend.observed_spend_90d),
                ],
                [
                  `Observed net spend · last ${detail.clv.history_days} days`,
                  moneyLabel(detail.future_spend.observed_spend_180d),
                ],
                [
                  `Predicted net spend · next ${detail.clv.horizon_days} days`,
                  forecastLabel(detail.future_spend, detail.clv),
                ],
                ['Last purchase', dateLabel(detail.future_spend.last_purchase)],
                ['Purchase days', numberLabel(detail.future_spend.purchase_days_180d)],
                ['Store region', detail.future_spend.region ?? '—'],
                ['Age range', detail.future_spend.age_range ?? '—'],
                ['Household size', detail.future_spend.household_size ?? '—'],
                [
                  'Loyalty membership',
                  detail.future_spend.loyalty_flag === 'Y'
                    ? 'Member'
                    : detail.future_spend.loyalty_flag === 'N'
                      ? 'Non-member'
                      : '—',
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-canvas p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted">
              This household has no record in the published CLV snapshot.
            </p>
          )}
          {isAvailable(detail.clv) && detail.future_spend?.eligible && detail.clv.as_of && (
            <p className="mt-4 text-sm text-muted">
              Forecast period {dateAfter(detail.clv.as_of, 1)} –{' '}
              {dateAfter(detail.clv.as_of, detail.clv.horizon_days)}.
            </p>
          )}
          {detail.future_spend?.eligible === false && (
            <p className="mt-4 text-sm text-muted">
              This household has no qualifying purchase in the past {detail.clv.history_days} days.
            </p>
          )}
        </Panel>
      )}
    </div>
  )
}
