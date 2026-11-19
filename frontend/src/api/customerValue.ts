import { client } from './client'
import type { components, paths } from './schema'

type SummaryRoute = '/api/v1/customers/clv/summary'
export type Cohort = NonNullable<paths[SummaryRoute]['get']['parameters']['query']>
export type ModelSummary = Awaited<ReturnType<typeof getCustomerValue>>
export type PredictionPage = Awaited<ReturnType<typeof getRankedHouseholds>>
export type ModelEvidence = ModelSummary['evidence']
export type HouseholdPrediction = components['schemas']['HouseholdPrediction']

export async function getCustomerValue(query: Cohort, signal: AbortSignal) {
  const { data } = await client.GET('/api/v1/customers/clv/summary', { params: { query }, signal })
  if (!data) throw new Error('Customer Value summary is unavailable.')
  return data
}

export async function getRankedHouseholds(query: Cohort, page: number, signal: AbortSignal) {
  const { data } = await client.GET('/api/v1/customers/clv/households', {
    params: { query: { ...query, page } },
    signal,
  })
  if (!data) throw new Error('Household results are unavailable.')
  return data
}

export async function getHouseholdValue(householdId: string, signal: AbortSignal) {
  const { data } = await client.GET('/api/v1/customers/{hshd_num}/predictions', {
    params: { path: { hshd_num: householdId } },
    signal,
  })
  if (!data) throw new Error('Household value is unavailable.')
  return data
}
