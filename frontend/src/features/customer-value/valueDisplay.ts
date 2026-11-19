import type { HouseholdPrediction, ModelEvidence, ModelSummary } from '../../api/customerValue'
import { moneyLabel } from '../../lib/format'

export const statusLabels = {
  available: 'Available',
  not_run: 'Not evaluated',
  unavailable: 'Unavailable',
  stale: 'Stale',
} satisfies Record<ModelEvidence['status'], string>

export const isAvailable = (evidence: ModelEvidence) =>
  evidence.status === 'available' && evidence.evaluation?.eligible === true

export function optionalMoney(value: number | string | null | undefined) {
  return value == null ? '—' : moneyLabel(value)
}

export function forecastLabel(row: HouseholdPrediction, evidence: ModelEvidence) {
  if (!isAvailable(evidence)) return 'Unavailable'
  if (!row.eligible) return 'No forecast'
  return optionalMoney(row.forecast)
}

export function loyaltyLabel(flag: string | null) {
  if (flag === 'Y') return 'Loyalty members'
  if (flag === 'N') return 'Non-members'
  return 'Membership unknown'
}

export function spendingSegments(summary: ModelSummary) {
  return (summary.observed_spend_segments ?? [])
    .filter(({ households }) => households > 0)
    .map((row) => ({ ...row, average: Number(row.net_spend) / row.households }))
    .sort((left, right) => right.average - left.average)
}

export function observedChange(summary: ModelSummary) {
  const recent = summary.historical_spend?.at(-1)
  const prior = summary.historical_spend?.at(-2)
  if (!recent || !prior) return null
  const before = Number(prior.net_spend)
  const amount = Number(recent.net_spend) - before
  return { amount, percent: before > 0 ? (amount / before) * 100 : null }
}
