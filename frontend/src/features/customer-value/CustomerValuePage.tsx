import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCustomerValue, getRankedHouseholds } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { HistoricalSpendTrend } from './HistoricalSpendTrend'
import { ModelEvidencePanel } from './ModelEvidencePanel'
import { readCohort } from './cohortQuery'
import { ValueFilters } from './ValueFilters'
import { ValueRanking } from './ValueRanking'
import { ValueError, ValueLoading } from './ValueRequestState'
import { ValueDistribution, ValueOverview } from './ValueSummary'
import { useValueRequest } from './useValueRequest'

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
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Customer Value (CLV)</h2>
        <p className="mt-1 text-sm text-muted">
          Compare observed household spend with validated future net spend, a proxy for customer
          lifetime value.
        </p>
      </header>
      <ValueFilters key={cohortKey} cohort={cohort} apply={(next) => setParams(next)} />
      {!result && <ValueLoading label="Loading cohort and model evidence" />}
      {result?.error && <ValueError message="Could not load Customer Value." retry={retry} />}
      {differentRun && (
        <ValueError message="The model or source data changed while loading." retry={retry} />
      )}
      {summary && !differentRun && (
        <>
          <ValueOverview summary={summary} />
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <HistoricalSpendTrend summary={summary} />
            <ValueDistribution summary={summary} />
            <div className="lg:col-span-2 2xl:col-span-1">
              <ModelEvidencePanel evidence={summary.evidence} />
            </div>
          </div>
          {summary.evidence.version && (
            <ValueRanking
              result={ranking}
              page={page}
              evidence={summary.evidence}
              selectPage={selectPage}
              retry={retryRanking}
            />
          )}
        </>
      )}
    </div>
  )
}
