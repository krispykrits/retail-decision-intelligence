import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getDashboard, type Dashboard, type DashboardQuery } from '../api/dashboard'
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
  const [retry, setRetry] = useState(0)
  const requestKey = `${search}:${retry}`
  const [result, setResult] = useState<{ key: string; data: Dashboard | null }>()
  const pending = result?.key !== requestKey
  const data = result?.data
  const current = data?.summary.current_period
  const prior = data?.summary.prior_period

  useEffect(() => {
    const controller = new AbortController()
    void getDashboard(readQuery(search), controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data })
      },
      () => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: null })
      },
    )
    return () => controller.abort()
  }, [search, requestKey])

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
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <WorkspaceIcon path="/command-center" className="size-9 text-brand" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Command Center</h1>
            <p className="mt-0.5 text-sm text-muted">
              Retail performance and changes worth investigating.
            </p>
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

      {pending ? (
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

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1.15fr_1.25fr_.85fr]">
            <DashboardTrend
              trend={data.trend}
              onMetricChange={(metric) => apply({ ...query, metric })}
            />
            <DashboardBreakdown
              breakdown={data.breakdown}
              netSpend={data.summary.current.spend}
              departmentLink={(name) =>
                `${dashboardPath}?${queryString({ ...query, department: name })}#performance-trend`
              }
            />
            <DashboardTakeaways summary={data.summary} breakdown={data.breakdown} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <DashboardSignals signals={data.signals} />
            <Panel aria-labelledby="explore-title">
              <h2 id="explore-title" className="mb-3 flex items-center gap-2 font-semibold">
                <WorkspaceIcon path="/command-center" className="size-5 text-brand" />
                Where to explore next
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {investigationWorkspaces.map(({ path, title, detail, style }) => (
                  <li key={path}>
                    <Link
                      className={`flex h-full items-center gap-2.5 rounded-xl px-3 py-3 text-ink no-underline transition-colors ${style}`}
                      to={path}
                    >
                      <WorkspaceIcon path={path} className="size-6 text-brand" />
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
          {data.options.first_date && data.options.last_date && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-nav">
              <strong>About this view.</strong> Observed transaction data from{' '}
              {periodLabel({ start: data.options.first_date, end: data.options.last_date })}.
              {prior && <> Prior period {periodLabel(prior)}.</>}
              {(current?.partial || prior?.partial) && (
                <> Comparison changes are unavailable for periods outside the source date range.</>
              )}
            </p>
          )}
        </>
      )}
    </div>
  )
}
