import { client } from './client'
import type { components } from './schema'

export type AccuracyOverview = components['schemas']['ForecastAccuracy']
export type HorizonAccuracy = components['schemas']['HorizonAccuracy']

export type AccuracyScope = { commodity?: string; region?: string; check_id?: string }

export async function getForecastAccuracy(query: AccuracyScope, signal: AbortSignal) {
  const { data } = await client.GET('/api/v1/forecasts/accuracy', { params: { query }, signal })
  if (!data) throw new Error('Forecast accuracy is unavailable.')
  return data
}
