import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { DashboardQuery } from '../../api/dashboard'
import { commandCenterPath, dataOperationsPath } from '../../app/workspaces'
import { LoadingProgress } from '../../components/LoadingProgress'
import { Panel } from '../../components/Panel'
import { Icon } from '../../components/WorkspaceIcon'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { DashboardBreakdown } from './DashboardBreakdown'
import { DashboardFilters } from './DashboardFilters'
import { DashboardSkeleton } from './DashboardSkeleton'
import { DashboardSignals } from './DashboardSignals'
import { DashboardSummary } from './DashboardSummary'
import { DashboardTakeaways } from './DashboardTakeaways'
import { DashboardTrend } from './DashboardTrend'
import { periodLabel } from './format'
import { queryString } from './query'
import { useDashboard } from './useDashboard'

export function CommandCenterPage() {
  const { search, hash, key } = useLocation()
  const navigate = useNavigate()
  const periodPicker = useRef<HTMLDetailsElement>(null)
  const {
    query,
    metric,
    result,
    pending,
    data,
    current,
    trend,
    trendReady,
    trendError,
    retry,
    retryTrend,
  } = useDashboard(search)

  useEffect(() => {
    function dismissPeriodPicker(event: PointerEvent) {
      const picker = periodPicker.current
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) {
        picker.open = false
      }
    }

    document.addEventListener('pointerdown', dismissPeriodPicker, true)
    return () => document.removeEventListener('pointerdown', dismissPeriodPicker, true)
  }, [])

  useEffect(() => {
    if (!pending && hash === '#performance-trend') {
      const trend = document.getElementById('performance-trend')
      trend?.focus({ preventScroll: true })
      trend?.scrollIntoView?.({ block: 'start' })
    }
  }, [hash, key, pending])

  function apply(filters: DashboardQuery) {
    void navigate({ pathname: commandCenterPath, search: queryString(filters) })
  }

  function applyPeriod(filters: DashboardQuery) {
    if (periodPicker.current) periodPicker.current.open = false
    apply({ ...filters, metric: query.metric })
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <WorkspaceHeader
        path={commandCenterPath}
        status={pending && data ? 'Updating retail performance…' : undefined}
      >
        {data?.options.first_date && (
          <details
            ref={periodPicker}
            className="group justify-self-start sm:relative md:col-start-1 md:row-start-2 xl:col-start-2 xl:row-start-1"
          >
            <summary className="relative flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-brand/40">
              <Icon name="calendar" className="size-5 text-brand" />
              <span className="grid">
                <span className="text-xs text-muted">Analysis period</span>
                <span className="font-semibold">
                  {pending ? 'Applying filters…' : current ? periodLabel(current) : 'Choose dates'}
                </span>
              </span>
              <Icon name="chevron" className="ml-1 size-4 text-muted group-open:rotate-180" />
              {pending && <LoadingProgress />}
            </summary>
            <Panel className="absolute right-4 left-4 z-20 mt-2 sm:right-auto sm:left-0 sm:w-100 xl:right-0 xl:left-auto">
              <DashboardFilters
                key={`${query.start ?? current?.start}-${query.end ?? current?.end}-${query.region}-${query.department}`}
                query={query}
                data={data}
                apply={applyPeriod}
                reset={() => applyPeriod({})}
              />
            </Panel>
          </details>
        )}
      </WorkspaceHeader>

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
        <DashboardSkeleton />
      ) : !data ? (
        <Panel role="alert">
          <h2 className="font-semibold">Retail performance couldn’t be loaded</h2>
          <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-link hover:bg-nav-hover"
              onClick={retry}
            >
              Retry
            </button>
            {search && <Link to={commandCenterPath}>Reset filters</Link>}
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
            <Link className="mt-3 inline-block text-sm font-semibold" to={dataOperationsPath}>
              Open Data Operations →
            </Link>
          )}
        </Panel>
      ) : (
        <>
          <DashboardSummary summary={data.summary} />

          <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
            <DashboardTrend
              trend={trend ?? data.trend}
              coverage={data.options}
              metric={metric}
              loading={!trendReady}
              error={trendError}
              retry={retryTrend}
              onMetricChange={(metric) => apply({ ...query, metric })}
            />
            <DashboardBreakdown
              key={result?.key}
              breakdown={data.breakdown}
              netSpend={data.summary.current.spend}
            />
          </div>

          <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
            <DashboardTakeaways
              summary={data.summary}
              breakdown={data.breakdown}
              region={result?.filters.region}
              department={result?.filters.department}
            />
            <DashboardSignals signals={data.signals} />
          </div>
        </>
      )}
    </div>
  )
}
