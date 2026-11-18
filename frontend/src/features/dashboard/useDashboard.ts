import { useEffect, useMemo, useState } from 'react'
import { abortableRequest } from '../../api/abortableRequest'
import {
  getDashboard,
  getDashboardTrend,
  type Dashboard,
  type DashboardQuery,
} from '../../api/dashboard'
import { queryString, readQuery } from './query'

export function useDashboard(search: string) {
  const query = readQuery(search)
  const metric = query.metric ?? 'spend'
  const filterSearch = queryString({ ...query, metric: undefined })
  const filters = useMemo(() => readQuery(filterSearch), [filterSearch])
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${filterSearch}:${attempt}`
  const [result, setResult] = useState<{
    key: string
    data: Dashboard | null
    filters: DashboardQuery
  }>()
  const pending = result?.key !== requestKey
  const data = result?.data
  const current = data?.summary.current_period
  const [trendAttempt, setTrendAttempt] = useState(0)
  const dashboardKey = result?.key
  const trendKey = `${metric}:${trendAttempt}`
  const [trendResult, setTrendResult] = useState<{
    dashboardKey: string
    key: string
    data: Dashboard['trend'] | null
  }>()
  const scopedTrend = trendResult?.dashboardKey === dashboardKey ? trendResult : undefined
  const matchingTrend = scopedTrend?.key === trendKey ? scopedTrend : undefined
  const defaultTrend = data?.trend.metric === metric ? data.trend : null
  const trendReady = Boolean(defaultTrend || matchingTrend)
  const trendError = !defaultTrend && matchingTrend?.data === null
  const trend = defaultTrend ?? scopedTrend?.data ?? data?.trend

  useEffect(
    () =>
      abortableRequest(
        (signal) => getDashboard(filters, signal),
        (data) => setResult({ key: requestKey, data, filters }),
        () => setResult({ key: requestKey, data: null, filters }),
      ),
    [filters, requestKey],
  )

  useEffect(() => {
    if (pending || !dashboardKey || !data?.summary.current || trendReady) return
    const period = data.summary.current_period
    const trendQuery = {
      ...filters,
      start: period?.start ?? filters.start,
      end: period?.end ?? filters.end,
      metric,
    }
    return abortableRequest(
      (signal) => getDashboardTrend(trendQuery, signal),
      (data) => setTrendResult({ dashboardKey, key: trendKey, data }),
      () => setTrendResult({ dashboardKey, key: trendKey, data: null }),
    )
  }, [dashboardKey, data, filters, metric, pending, trendKey, trendReady])

  return {
    query,
    metric,
    result,
    pending,
    data,
    current,
    trend,
    trendReady,
    trendError,
    retry: () => setAttempt((attempt) => attempt + 1),
    retryTrend: () => setTrendAttempt((attempt) => attempt + 1),
  }
}
