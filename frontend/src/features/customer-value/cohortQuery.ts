import type { Cohort } from '../../api/customerValue'

export const regions = ['CENTRAL', 'EAST', 'SOUTH', 'WEST'] as const

export function readCohort(params: URLSearchParams): Cohort {
  const region = regions.find((value) => value === params.get('region'))
  const loyalty = params.get('loyalty_flag')
  return {
    region,
    loyalty_flag: loyalty === 'Y' || loyalty === 'N' ? loyalty : undefined,
    age_range: params.get('age_range')?.trim().slice(0, 80) || undefined,
    household_size: params.get('household_size')?.trim().slice(0, 80) || undefined,
  }
}
