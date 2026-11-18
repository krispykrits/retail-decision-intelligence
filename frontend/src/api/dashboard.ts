import { client } from './client'
import type { components, paths } from './schema'

export type Dashboard = components['schemas']['Dashboard']
export type DashboardQuery = NonNullable<paths['/api/v1/dashboard']['get']['parameters']['query']>
export type Metric = NonNullable<DashboardQuery['metric']>
export type Period = components['schemas']['Period']
export type Point = components['schemas']['MetricPoint']

export async function getDashboard(query: DashboardQuery, signal: AbortSignal) {
  const { data } = await client.GET('/api/v1/dashboard', { params: { query }, signal })
  if (!data) throw new Error('Dashboard data is unavailable.')
  return data
}
