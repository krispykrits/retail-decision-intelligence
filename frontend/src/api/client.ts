import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export const client = createClient<paths>()

type HealthResponse = components['schemas']['HealthResponse']

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const { data, response } = await client.GET('/api/v1/health', { signal })
  if (!response.ok || !data) {
    throw new Error('Service status unavailable')
  }
  return data
}
