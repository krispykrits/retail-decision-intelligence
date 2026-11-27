import type { HouseholdPrediction, ModelEvidence } from '../../api/customerValue'
import { InfoTooltip } from '../../components/InfoTooltip'
import { PanelHeading } from '../../components/Panel'
import { dateAfter, dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import { forecastLabel, isAvailable, optionalMoney, statusLabels } from './valueDisplay'

export function HouseholdValueDetails({
  householdId,
  household,
  evidence,
}: {
  householdId: string
  household: HouseholdPrediction | null
  evidence: ModelEvidence
}) {
  return (
    <>
      <PanelHeading
        id="clv-household-detail"
        title={`Household ${householdId}`}
        icon="/customers"
        helpLabel="this household’s spending summary"
        className="relative"
      >
        See this household’s recorded spending and shopping activity, plus its next 90 days of
        expected spending when available.
      </PanelHeading>
      <p className="mt-2 text-sm text-muted">
        Model status: {statusLabels[evidence.status]}
        {evidence.as_of && ` · Data through ${dateLabel(evidence.as_of)}`}
      </p>

      {household ? (
        <dl className="mt-4 grid gap-x-3 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              'Observed spend · last 90 days',
              optionalMoney(household.observed_spend_90d),
              'What this household spent in the past 90 days, after returns.',
            ],
            [
              `Observed net spend · last ${evidence.history_days} days`,
              moneyLabel(household.observed_spend_180d),
              'What this household spent over the longer period shown, after returns.',
            ],
            [
              `Predicted net spend · next ${evidence.horizon_days} days`,
              forecastLabel(household, evidence),
              'How much this household is expected to spend during the forecast dates.',
            ],
            [
              'Last purchase',
              dateLabel(household.last_purchase),
              'The latest purchase date in the records used for this view.',
            ],
            [
              'Purchase days',
              numberLabel(household.purchase_days_180d),
              'The number of days this household made at least one purchase in the past 180 days.',
            ],
            [
              'Store region',
              household.region ?? '—',
              'The store region this household shopped in on its most recent purchase date.',
            ],
            [
              'Age range',
              household.age_range ?? '—',
              'The age group listed in the household record.',
            ],
            [
              'Household size',
              household.household_size ?? '—',
              'The number of people listed in the household record.',
            ],
            [
              'Loyalty membership',
              household.loyalty_flag === 'Y'
                ? 'Member'
                : household.loyalty_flag === 'N'
                  ? 'Non-member'
                  : '—',
              'Whether the household record shows loyalty program membership.',
            ],
          ].map(([label, value, help]) => (
            <div key={label} className="rounded-lg bg-canvas p-3">
              <dt className="relative flex items-center gap-1.5 text-xs text-muted">
                {label}
                <InfoTooltip label={label}>{help}</InfoTooltip>
              </dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">
          This household has no record in the published CLV snapshot.
        </p>
      )}
      {isAvailable(evidence) && household?.eligible && evidence.as_of && (
        <p className="mt-4 text-sm text-muted">
          Forecast period {dateAfter(evidence.as_of, 1)} –{' '}
          {dateAfter(evidence.as_of, evidence.horizon_days)}.
        </p>
      )}
      {household?.eligible === false && (
        <p className="mt-4 text-sm text-muted">
          This household has no qualifying purchase in the past {evidence.history_days} days.
        </p>
      )}
    </>
  )
}
