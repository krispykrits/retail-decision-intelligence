import type { DashboardQuery } from '../../api/dashboard'
import { isMetric } from './format'

export function readQuery(search: string): DashboardQuery {
  const params = new URLSearchParams(search)
  const metric = params.get('metric')
  const region = params.get('region')
  return {
    start: params.get('start') || undefined,
    end: params.get('end') || undefined,
    region: (region || undefined) as DashboardQuery['region'],
    department: params.get('department') || undefined,
    metric: isMetric(metric) ? metric : 'spend',
  }
}

export function queryString(query: DashboardQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value && (key !== 'metric' || value !== 'spend')) params.set(key, value)
  }
  return params.toString()
}
