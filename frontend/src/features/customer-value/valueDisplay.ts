import type { HouseholdPrediction, ModelEvidence } from '../../api/customerValue'
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
  if (!row.eligible) return 'Ineligible'
  return optionalMoney(row.forecast)
}
