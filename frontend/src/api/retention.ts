import { client } from './client'
import type { Cohort } from './customerValue'

export type RetentionOverview = Awaited<ReturnType<typeof getRetention>>
export type RetentionHousehold = RetentionOverview['households'][number]

export async function getRetention(cohort: Cohort, signal: AbortSignal) {
  const { region, loyalty_flag, age_range, household_size, segment } = cohort
  const { data } = await client.GET('/api/v1/customers/churn/engagement', {
    params: { query: { region, loyalty_flag, age_range, household_size, segment } },
    signal,
  })
  if (!data) throw new Error('Retention data is unavailable.')
  return data
}
