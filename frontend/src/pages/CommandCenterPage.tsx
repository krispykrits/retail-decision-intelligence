import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  getDashboard,
  getDashboardTrend,
  type Dashboard,
  type DashboardQuery,
} from '../api/dashboard'
import { workspaces } from '../app/workspaces'
import { AccountMenu } from '../components/AccountMenu'
import { Panel } from '../components/Panel'
import { Spinner } from '../components/Spinner'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { DashboardBreakdown } from '../features/dashboard/DashboardBreakdown'
import { DashboardFilters } from '../features/dashboard/DashboardFilters'
import { DashboardSignals } from '../features/dashboard/DashboardSignals'
import { DashboardSummary } from '../features/dashboard/DashboardSummary'
import { DashboardTakeaways } from '../features/dashboard/DashboardTakeaways'
import { DashboardTrend } from '../features/dashboard/DashboardTrend'
import { isMetric, periodLabel } from '../features/dashboard/format'

const dashboardPath = workspaces[0].path
const investigationWorkspaces = [
  {
    ...workspaces[1],
    detail: 'Segments, value, and retention',
    style: 'bg-sky-50 hover:bg-sky-100',
  },
  {
    ...workspaces[2],
    detail: 'Category, product, and assortment',
    style: 'bg-emerald-50 hover:bg-emerald-100',
  },
  {
    ...workspaces[3],
    detail: 'Affinity, rules, and basket behavior',
    style: 'bg-violet-50 hover:bg-violet-100',
  },
  {
    ...workspaces[4],
    detail: 'Demand outlook and scenarios',
    style: 'bg-amber-50 hover:bg-amber-100',
  },
]

function readQuery(search: string): DashboardQuery {
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

function queryString(query: DashboardQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value && (key !== 'metric' || value !== 'spend')) params.set(key, value)
  }
  return params.toString()
}

export function CommandCenterPage() {
  const { search, hash, key } = useLocation()
  const navigate = useNavigate()
  const periodPicker = useRef<HTMLDetailsElement>(null)
  const query = readQuery(search)
  const metric = query.metric ?? 'spend'
  const filterSearch = queryString({ ...query, metric: undefined })
  const [retry, setRetry] = useState(0)
  const requestKey = `${filterSearch}:${retry}`
  const [result, setResult] = useState<{ key: string; data: Dashboard | null }>()
  const pending = result?.key !== requestKey
  const data = result?.data
  const current = data?.summary.current_period
  const [trendRetry, setTrendRetry] = useState(0)
  const trendKey = `${result?.key}:${metric}:${trendRetry}`
  const [trendResult, setTrendResult] = useState<{ key: string; data: Dashboard['trend'] | null }>()
  const defaultTrend = data?.trend.metric === metric ? data.trend : null
  const trendReady = Boolean(defaultTrend || trendResult?.key === trendKey)
  const trendError = !defaultTrend && trendResult?.key === trendKey && trendResult.data === null
  const trend =
    defaultTrend ??
    (trendResult?.key.startsWith(`${result?.key}:`) ? trendResult.data : null) ??
    data?.trend

  useEffect(() => {
    const controller = new AbortController()
    void getDashboard(readQuery(filterSearch), controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data })
      },
      () => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: null })
      },
    )
    return () => controller.abort()
  }, [filterSearch, requestKey])

  useEffect(() => {
    if (pending || !data?.summary.current || trendReady) return
    const controller = new AbortController()
    const period = data.summary.current_period
    const filters = readQuery(filterSearch)
    void getDashboardTrend(
      {
        ...filters,
        start: period?.start ?? filters.start,
        end: period?.end ?? filters.end,
        metric,
      },
      controller.signal,
    ).then(
      (data) => {
        if (!controller.signal.aborted) setTrendResult({ key: trendKey, data })
      },
      () => {
        if (!controller.signal.aborted) setTrendResult({ key: trendKey, data: null })
      },
    )
    return () => controller.abort()
  }, [data, filterSearch, metric, pending, trendKey, trendReady])

  useEffect(() => {
    if (!pending && hash === '#performance-trend') {
      const trend = document.getElementById('performance-trend')
      trend?.focus({ preventScroll: true })
      trend?.scrollIntoView?.({ block: 'start' })
    }
  }, [hash, key, pending])

  function apply(filters: DashboardQuery) {
    void navigate({ pathname: dashboardPath, search: queryString(filters) })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <WorkspaceIcon path="/command-center" className="size-8 shrink-0 text-brand" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Command Center</h1>
            {pending && data ? (
              <p role="status" className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                <Spinner />
                Updating retail performance…
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted">
                Retail performance and investigation signals.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data?.options.first_date && (
            <details ref={periodPicker} className="group sm:relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-brand/40">
                <span aria-hidden="true" className="text-lg text-brand">
                  ▦
                </span>
                <span className="grid">
                  <span className="text-xs text-muted">Analysis period</span>
                  <span className="font-semibold">
                    {current ? periodLabel(current) : 'Choose dates'}
                  </span>
                </span>
                <span aria-hidden="true" className="ml-1 text-muted group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <Panel className="absolute right-4 left-4 z-20 mt-2 sm:right-0 sm:left-auto sm:w-100">
                <DashboardFilters
                  key={`${query.start ?? current?.start}-${query.end ?? current?.end}-${query.region}-${query.department}`}
                  query={query}
                  data={data}
                  apply={(filters) => {
                    if (periodPicker.current) periodPicker.current.open = false
                    apply({ ...filters, metric: query.metric })
                  }}
                  reset={() => {
                    if (periodPicker.current) periodPicker.current.open = false
                    apply({ metric: query.metric })
                  }}
                />
              </Panel>
            </details>
          )}
          <AccountMenu />
        </div>
      </header>

      {!pending && current?.partial && data?.options.first_date && data.options.last_date && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink"
        >
          This selection extends beyond the imported dates{' '}
          {periodLabel({ start: data.options.first_date, end: data.options.last_date })}. Results
          cover the available dates only.
        </p>
      )}

      {pending && !data ? (
        <Panel role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner />
          Loading retail performance…
        </Panel>
      ) : !data ? (
        <Panel role="alert">
          <h2 className="font-semibold">Retail performance couldn’t be loaded</h2>
          <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-link hover:bg-nav-hover"
              onClick={() => setRetry(retry + 1)}
            >
              Retry
            </button>
            {search && <Link to={dashboardPath}>Reset filters</Link>}
          </div>
        </Panel>
      ) : !data.summary.current ? (
        <Panel>
          <h2 className="font-semibold">
            {current ? 'No matching transactions' : 'No transactions imported yet'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {current
              ? 'Choose a different date range, region, or department.'
              : 'Check Data Operations for the current dataset status.'}
          </p>
          {!current && (
            <Link className="mt-3 inline-block text-sm font-semibold" to="/data">
              Open Data Operations →
            </Link>
          )}
        </Panel>
      ) : (
        <>
          <DashboardSummary summary={data.summary} />

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1.1fr_1.18fr_.87fr]">
            <DashboardTrend
              trend={trend ?? data.trend}
              coverage={data.options}
              metric={metric}
              loading={!trendReady}
              error={trendError}
              retry={() => setTrendRetry((attempt) => attempt + 1)}
              onMetricChange={(metric) => apply({ ...query, metric })}
            />
            <DashboardBreakdown
              key={result?.key}
              breakdown={data.breakdown}
              netSpend={data.summary.current.spend}
            />
            <DashboardTakeaways summary={data.summary} breakdown={data.breakdown} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <DashboardSignals signals={data.signals} />
            <Panel aria-labelledby="explore-title">
              <h2
                id="explore-title"
                className="mb-3 flex items-center gap-2 text-base font-semibold"
              >
                <WorkspaceIcon path="/command-center" className="size-5 text-brand" />
                Where to explore next
              </h2>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {investigationWorkspaces.map(({ path, title, detail, style }) => (
                  <li key={path}>
                    <Link
                      className={`flex h-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-ink no-underline transition-colors ${style}`}
                      to={path}
                    >
                      <WorkspaceIcon path={path} className="size-5 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="mt-0.5 block text-xs text-muted">{detail}</span>
                      </span>
                      <span aria-hidden="true" className="text-brand">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
