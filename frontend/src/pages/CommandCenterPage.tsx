import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getDashboard, type Dashboard, type DashboardQuery } from '../api/dashboard'
import { workspaces } from '../app/workspaces'
import { Panel } from '../components/Panel'
import { Spinner } from '../components/Spinner'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { DashboardBreakdown } from '../features/dashboard/DashboardBreakdown'
import { DashboardFilters } from '../features/dashboard/DashboardFilters'
import { DashboardSignals } from '../features/dashboard/DashboardSignals'
import { DashboardSummary } from '../features/dashboard/DashboardSummary'
import { DashboardTrend } from '../features/dashboard/DashboardTrend'
import { isMetric, periodLabel, valueLabel } from '../features/dashboard/format'

const dashboardPath = workspaces[0].path
const investigationWorkspaces = workspaces.slice(1, 5)

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Command Center</h1>
          <p className="mt-1 text-sm text-muted">
            Retail performance and changes worth investigating.
          </p>
        </div>
        {current && !pending && (
          <span className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-nav">
            {periodLabel(current)}
          </span>
        )}
      </header>

      {data?.options.first_date && (
        <Panel>
          <DashboardFilters
            key={`${query.start ?? current?.start}-${query.end ?? current?.end}-${query.region}-${query.department}`}
            query={query}
            data={data}
            apply={(filters) => apply({ ...filters, metric: query.metric })}
            reset={() => apply({ metric: query.metric })}
          />
        </Panel>
      )}

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
          {current && prior && (
            <p className="text-sm text-muted">
              Prior period {periodLabel(prior)}.
              {(current.partial || prior.partial) && (
                <span className="ml-2 font-medium text-ink">
                  The selection or prior period extends beyond source dates. Comparison changes are
                  unavailable.
                </span>
              )}
            </p>
          )}

          <DashboardSummary summary={data.summary} />

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardTrend
              trend={data.trend}
              onMetricChange={(metric) => apply({ ...query, metric })}
            />
            <DashboardBreakdown
              breakdown={data.breakdown}
              departmentLink={(name) =>
                `${dashboardPath}?${queryString({ ...query, department: name })}#performance-trend`
              }
            />
          </div>

          {data.summary.cohorts && (
            <Panel aria-label="Household activity across periods">
              <h2 className="mb-2 font-semibold">Household activity across periods</h2>
              <dl className="grid gap-2 text-sm text-nav sm:grid-cols-3">
                <div>
                  <dt>Active in both</dt>
                  <dd className="font-semibold tabular-nums">
                    {valueLabel('households', data.summary.cohorts.active_in_both)}
                  </dd>
                </div>
                <div>
                  <dt>Active only in selected period</dt>
                  <dd className="font-semibold tabular-nums">
                    {valueLabel('households', data.summary.cohorts.active_only_in_current)}
                  </dd>
                </div>
                <div>
                  <dt>Active only in prior period</dt>
                  <dd className="font-semibold tabular-nums">
                    {valueLabel('households', data.summary.cohorts.active_only_in_previous)}
                  </dd>
                </div>
              </dl>
            </Panel>
          )}

          <div className="grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
            <DashboardSignals signals={data.signals} />
            <Panel aria-labelledby="explore-title">
              <h2 id="explore-title" className="mb-3 font-semibold">
                Explore workspaces
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {investigationWorkspaces.map(({ path, title }) => (
                  <li key={path}>
                    <Link
                      className="flex h-full items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm font-semibold no-underline hover:bg-nav-hover hover:underline"
                      to={path}
                    >
                      <WorkspaceIcon path={path} />
                      {title}
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
