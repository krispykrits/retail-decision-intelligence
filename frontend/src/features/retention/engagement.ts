import type { RetentionHousehold } from '../../api/retention'

export const activeDays = 90
export const inactiveDays = 180

export const engagementGroups = [
  { key: 'active', label: 'Active', color: 'text-brand', fill: 'fill-brand' },
  { key: 'at_risk', label: 'At risk', color: 'text-violet-700', fill: 'fill-violet-600' },
  { key: 'inactive', label: 'Inactive', color: 'text-pink-700', fill: 'fill-pink-600' },
] as const

export function atRisk(household: RetentionHousehold) {
  const days = household.recency_days
  return days !== null && days > activeDays && days <= inactiveDays
}

export function percent(fraction: number) {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(
    fraction,
  )
}
