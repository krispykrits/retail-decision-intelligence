import type { Cohort } from '../../api/customerValue'

export const regions = ['CENTRAL', 'EAST', 'SOUTH', 'WEST'] as const

export const segmentLabels = {
  higher_spend: 'Higher-spend households',
  frequent: 'Frequent shoppers',
  infrequent: 'Infrequent shoppers',
  other: 'Other households',
} satisfies Record<NonNullable<Cohort['segment']>, string>

export function readCohort(params: URLSearchParams): Cohort {
  const region = regions.find((value) => value === params.get('region'))
  const segment = (Object.keys(segmentLabels) as Array<keyof typeof segmentLabels>).find(
    (key) => key === params.get('segment'),
  )
  return {
    region,
    segment,
    age_range: params.get('age_range')?.trim().slice(0, 80) || undefined,
    household_size: params.get('household_size')?.trim().slice(0, 80) || undefined,
  }
}
