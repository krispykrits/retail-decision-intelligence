import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCustomerValue, getRankedHouseholds } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { dateLabel } from '../../lib/format'
import { InfoTooltip } from '../../components/InfoTooltip'
import { Icon } from '../../components/WorkspaceIcon'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { HistoricalSpendTrend } from './HistoricalSpendTrend'
import { readCohort } from './cohortQuery'
import { ValueFilters } from './ValueFilters'
import { ValueRanking } from './ValueRanking'
import { ValueError, ValueLoading } from './ValueRequestState'
import { ValueOutlook, ValueOverview } from './ValueSummary'
import { ValueInsights } from './ValueInsights'
import { ValueSegments } from './ValueSegments'
import { useValueRequest } from './useValueRequest'

const customerSections = [
  'Segmentation & Behavior',
  'Customer Value (CLV)',
  'Retention & Churn',
  'External Factors',
  'Customer Explorer',
]

export function CustomerValuePage() {
  const [params, setParams] = useSearchParams()
  const rawPage = Number(params.get('page'))
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1
  const filterParams = new URLSearchParams(params)
  filterParams.delete('page')
  const cohortKey = filterParams.toString()
  const cohort = useMemo(() => readCohort(new URLSearchParams(cohortKey)), [cohortKey])
  const load = useCallback((signal: AbortSignal) => getCustomerValue(cohort, signal), [cohort])
  const { result, retry } = useValueRequest(load)
  const summary = result?.data
  const loadRanking = useCallback(
    (signal: AbortSignal) => getRankedHouseholds(cohort, page, signal),
    [cohort, page],
  )
  const { result: ranking, retry: retryRanking } = useValueRequest(
    summary?.evidence.version ? loadRanking : undefined,
  )
  const differentRun =
    ranking?.data &&
    (ranking.data.evidence.version !== summary?.evidence.version ||
      ranking.data.evidence.status !== summary?.evidence.status)

  function selectPage(nextPage: number) {
    const next = new URLSearchParams(params)
    if (nextPage === 1) next.delete('page')
    else next.set('page', String(nextPage))
    setParams(next)
  }

  return (
    <div className="space-y-4">
      <WorkspaceHeader path={customerIntelligencePath} />
      <nav
        aria-label="Customer Intelligence sections"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {customerSections.map((section) => (
          <span
            key={section}
            aria-current={section === 'Customer Value (CLV)' ? 'page' : undefined}
            aria-disabled={section !== 'Customer Value (CLV)' || undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${section === 'Customer Value (CLV)' ? 'border-brand font-semibold text-link' : 'border-transparent text-muted'}`}
          >
            {section}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-end gap-3">
        {summary?.evidence.source_first_date && summary.evidence.as_of && (
          <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <Icon name="calendar" className="size-4 text-brand" />
            <span className="sr-only">Recorded data period</span>
            {dateLabel(summary.evidence.source_first_date)} – {dateLabel(summary.evidence.as_of)}
          </p>
        )}
        <ValueFilters key={cohortKey} cohort={cohort} apply={(next) => setParams(next)} />
        <div className="relative flex items-center gap-2 rounded-lg bg-nav-selected px-3 py-2 text-sm font-medium text-link sm:ml-auto">
          About Customer Value
          <InfoTooltip label="Customer Value">
            Observed spending includes returns. The forecast estimates what households may spend in
            the next 90 days as a proxy for customer lifetime value.
          </InfoTooltip>
        </div>
      </div>
      {!result && <ValueLoading label="Loading cohort and model evidence" />}
      {result?.error && <ValueError message="Could not load Customer Value." retry={retry} />}
      {differentRun && (
        <ValueError message="The model or source data changed while loading." retry={retry} />
      )}
      {summary && !differentRun && (
        <>
          <ValueOverview summary={summary} />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <HistoricalSpendTrend summary={summary} />
            <ValueSegments summary={summary} />
            <ValueOutlook summary={summary} />
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {summary.evidence.version && (
              <ValueRanking
                result={ranking}
                page={page}
                evidence={summary.evidence}
                selectPage={selectPage}
                retry={retryRanking}
              />
            )}
            <ValueInsights summary={summary} />
          </div>
        </>
      )}
    </div>
  )
}
