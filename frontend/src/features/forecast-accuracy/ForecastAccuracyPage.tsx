import { useCallback, useState } from 'react'
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  getForecastAccuracy,
  type AccuracyOverview,
  type AccuracyScope,
} from '../../api/forecastAccuracy'
import { useRequest } from '../../api/useRequest'
import { forecastEvidencePath, forecastStudioPath } from '../../app/workspaces'
import { Panel } from '../../components/Panel'
import { Skeleton } from '../../components/Skeleton'
import { Icon } from '../../components/WorkspaceIcon'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { dateLabel } from '../../lib/format'
import { AccuracyTable, ForecastComparison, PurchaseHistory, Usability } from './AccuracyCards'
import { horizonLabels } from './horizons'

const grid = 'grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]'
const field = 'w-full min-w-0 rounded-lg border border-field-line bg-surface px-3 py-2 text-sm'
const sections = [
  { label: 'Demand Outlook' },
  { label: 'Scenario Explorer' },
  { label: 'Forecast Accuracy', path: forecastStudioPath },
  { label: 'Forecast Evidence', path: forecastEvidencePath },
]

function StudioHeader() {
  const { search } = useLocation()
  const base = 'shrink-0 border-b-2 px-3 py-2 text-sm'
  return (
    <>
      <WorkspaceHeader path={forecastStudioPath} />
      <nav
        aria-label="Forecast Studio sections"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {sections.map(({ label, path }) =>
          path ? (
            <NavLink
              key={label}
              to={{ pathname: path, search }}
              end
              className={({ isActive }) =>
                `${base} ${isActive ? 'border-brand font-semibold text-link' : 'border-transparent text-muted hover:text-link'}`
              }
            >
              {label}
            </NavLink>
          ) : (
            <span
              key={label}
              aria-disabled="true"
              className={`${base} border-transparent text-muted`}
            >
              {label}
            </span>
          ),
        )}
      </nav>
    </>
  )
}

export function ForecastEvidencePage() {
  const { search } = useLocation()
  return (
    <div className="space-y-4">
      <StudioHeader />
      <Panel>
        <h2 className="font-semibold">Forecast Evidence</h2>
        <p className="mt-2 text-sm text-muted">
          The dedicated evidence view is coming later. Open Technical details on Forecast Accuracy
          to review the method, data versions and dates for a saved check.
        </p>
        <Link
          to={{ pathname: forecastStudioPath, search }}
          className="mt-3 inline-block text-sm font-semibold"
        >
          Back to Forecast Accuracy
        </Link>
      </Panel>
    </div>
  )
}

const checkedAt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function AccuracyFilters({
  data,
  scope,
  horizon,
  apply,
}: {
  data: AccuracyOverview
  scope: AccuracyScope
  horizon: number
  apply: (scope: AccuracyScope, horizon: number) => void
}) {
  const [commodity, setCommodity] = useState(scope.commodity ?? data.commodity ?? '')
  const [region, setRegion] = useState(scope.region ?? '')
  const [lookAhead, setLookAhead] = useState(horizon)
  const [checkId, setCheckId] = useState(scope.check_id ?? '')
  const scopeMatches = commodity === data.commodity && region === (data.region ?? '')
  const completed = scopeMatches ? data.checks.filter((check) => check.status === 'completed') : []

  return (
    <Panel>
      <form
        aria-label="Forecast accuracy filters"
        className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.8fr_1.3fr_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          apply(
            {
              commodity: commodity || undefined,
              region: region || undefined,
              check_id: checkId || undefined,
            },
            lookAhead,
          )
        }}
      >
        <label className="grid min-w-0 gap-1 text-xs font-medium text-nav">
          Commodity
          <select
            className={field}
            value={commodity}
            onChange={(event) => {
              setCommodity(event.target.value)
              setCheckId('')
            }}
          >
            {!data.commodities.length && <option value="">No commodities</option>}
            {data.commodities.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-nav">
          Region
          <select
            className={field}
            value={region}
            onChange={(event) => {
              setRegion(event.target.value)
              setCheckId('')
            }}
          >
            <option value="">All regions</option>
            {data.regions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-nav">
          How far ahead
          <select
            className={field}
            value={lookAhead}
            onChange={(event) => setLookAhead(Number(event.target.value))}
          >
            {horizonLabels.map(({ weeks, label }) => (
              <option key={weeks} value={weeks}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-nav">
          Accuracy check
          <select
            className={field}
            value={checkId}
            disabled={!completed.length}
            onChange={(event) => setCheckId(event.target.value)}
          >
            <option value="">
              {scopeMatches ? 'Choose a completed check' : 'Apply filters to find checks'}
            </option>
            {checkId && !completed.some((check) => check.id === checkId) && (
              <option value={checkId} disabled>
                Saved check unavailable
              </option>
            )}
            {completed.map((check) => (
              <option key={check.id} value={check.id}>
                {checkedAt.format(new Date(check.checked_at))} UTC · {check.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold whitespace-nowrap text-white"
        >
          View results
        </button>
      </form>
    </Panel>
  )
}

function noticeFor(data: AccuracyOverview, checkId?: string) {
  const latest = data.selected ?? data.checks[0]
  if (checkId && !data.selected)
    return 'This accuracy check is unavailable for the selected filters or current purchase data.'
  if (latest?.status === 'failed')
    return data.selected?.evidence.reason ?? 'The most recent accuracy check failed.'
  if (latest?.status === 'insufficient_history')
    return (
      data.selected?.evidence.reason ?? 'The most recent check found too little purchase history.'
    )
  if (data.selected) return `Accuracy check completed ${dateLabel(data.selected.checked_at)}.`
  if (data.checks.length) return 'Choose a completed accuracy check to compare the forecasts.'
  if (!data.coverage.first_purchase) return 'Import purchase data to make accuracy checks possible.'
  return 'No accuracy checks have been run for this selection.'
}

export function ForecastAccuracyPage() {
  const [search, setSearch] = useSearchParams()
  const commodity = search.get('commodity') || undefined
  const region = search.get('region') || undefined
  const checkId = search.get('check_id') || undefined
  const requestedHorizon = Number(search.get('horizon'))
  const horizon = horizonLabels.some(({ weeks }) => weeks === requestedHorizon)
    ? requestedHorizon
    : 1
  const load = useCallback(
    (signal: AbortSignal) => getForecastAccuracy({ commodity, region, check_id: checkId }, signal),
    [commodity, region, checkId],
  )
  const { result, previousData, retry } = useRequest(load)
  const data = result?.data
  const filters = data ?? previousData

  function apply(scope: AccuracyScope, weeks: number) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(scope)) if (value) params.set(key, value)
    if (weeks !== 1) params.set('horizon', String(weeks))
    if (params.toString() === search.toString()) retry()
    else setSearch(params)
  }

  const notice = data ? noticeFor(data, checkId) : ''
  const horizons = data?.selected?.evidence.horizons ?? []
  const active = horizons.find((row) => row.horizon === horizon)
  const missingCheck = checkId && !data?.selected

  return (
    <div className="space-y-4">
      <StudioHeader />
      {filters && (
        <AccuracyFilters
          key={JSON.stringify([search.toString(), filters.commodity, filters.region])}
          data={filters}
          scope={{ commodity, region, check_id: checkId }}
          horizon={horizon}
          apply={apply}
        />
      )}
      {result?.error ? (
        <Panel className="flex flex-wrap items-center gap-3 text-sm">
          <p role="alert" className="text-error">
            Forecast accuracy couldn’t be loaded.
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white"
          >
            Retry
          </button>
        </Panel>
      ) : !data ? (
        <div role="status" aria-label="Loading forecast accuracy" className={grid}>
          {[0, 1, 2, 3].map((index) => (
            <Panel key={index} className="space-y-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-36 w-full" />
            </Panel>
          ))}
        </div>
      ) : (
        <>
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-nav-selected px-3 py-2 text-sm text-nav"
          >
            <Icon name="/forecast" className="size-4 text-brand" />
            {notice}
          </p>
          <div className={grid}>
            <ForecastComparison
              commodity={data.commodity}
              result={active}
              empty={
                missingCheck
                  ? 'Accuracy check unavailable'
                  : data.selected || !data.checks.some((check) => check.status === 'completed')
                    ? 'No accuracy results available'
                    : 'No accuracy check selected'
              }
            />
            <PurchaseHistory data={data} />
            <AccuracyTable results={horizons} horizon={horizon} />
            <Usability check={data.selected} result={active} notice={notice} />
          </div>
        </>
      )}
    </div>
  )
}
