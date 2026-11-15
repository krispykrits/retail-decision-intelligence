import createClient from 'openapi-fetch'
import type { paths } from './schema'

const client = createClient<paths>()

export async function getHealth(signal?: AbortSignal) {
  const { data, response } = await client.GET('/api/v1/health', { signal })
  if (!response.ok || !data) {
    throw new Error('Service status unavailable')
  }
  return data
}
