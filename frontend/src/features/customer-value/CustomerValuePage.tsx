import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCustomerValue, getRankedHouseholds } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { HistoricalSpendTrend } from './HistoricalSpendTrend'
import { readCohort } from './cohortQuery'
import { ValueFilters } from './ValueFilters'
import { ValueRanking } from './ValueRanking'
import { ValueError } from './ValueRequestState'
import { ValuePageSkeleton } from './ValuePageSkeleton'
import { valueAnalysisGrid } from './valueLayout'
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
  const { result, previousData, retry } = useValueRequest(load)
  const updating = !result && Boolean(previousData)
  const summary = result ? result.data : previousData
  const currentSummary = result?.data
  const loadRanking = useMemo(
    () =>
      currentSummary?.evidence.version
        ? (signal: AbortSignal) => getRankedHouseholds(cohort, page, signal)
        : undefined,
    [cohort, currentSummary, page],
  )
  const { result: ranking, retry: retryRanking } = useValueRequest(loadRanking)
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
    <div className="space-y-3 md:space-y-4">
      <WorkspaceHeader
        path={customerIntelligencePath}
        status={updating ? 'Updating household spending…' : undefined}
      />
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
      <ValueFilters
        key={cohortKey}
        cohort={cohort}
        updating={updating}
        apply={(next) => setParams(next)}
      />
      {!result && !summary && <ValuePageSkeleton />}
      {result?.error && <ValueError message="Could not load Customer Value." retry={retry} />}
      {differentRun && (
        <ValueError message="The model or source data changed while loading." retry={retry} />
      )}
      {summary && !differentRun && (
        <div aria-busy={updating} inert={updating} className="space-y-3 md:space-y-4">
          <ValueOverview summary={summary} />
          <div className={valueAnalysisGrid}>
            <HistoricalSpendTrend summary={summary} />
            <ValueSegments summary={summary} />
            <ValueOutlook summary={summary} />
          </div>
          <div className="grid items-start gap-3 md:gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {summary.evidence.version && (
              <ValueRanking
                key={`${cohortKey}:${page}`}
                result={ranking}
                observedPeriod={summary.historical_spend?.at(-1)}
                page={page}
                evidence={summary.evidence}
                selectPage={selectPage}
                retry={retryRanking}
              />
            )}
            <ValueInsights summary={summary} />
          </div>
        </div>
      )}
    </div>
  )
}
