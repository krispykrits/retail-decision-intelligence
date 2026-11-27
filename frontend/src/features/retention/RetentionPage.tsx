import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getRetention, type RetentionOverview } from '../../api/retention'
import { customerIntelligencePath } from '../../app/workspaces'
import { InfoTooltip } from '../../components/InfoTooltip'
import { Panel, PanelHeading } from '../../components/Panel'
import { TakeawayList } from '../../components/TakeawayList'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { dateAfter, dateLabel, numberLabel } from '../../lib/format'
import { CustomerTabs } from '../customer-value/CustomerTabs'
import { readCohort, segmentLabels } from '../customer-value/cohortQuery'
import { isAvailable, statusLabels } from '../customer-value/valueDisplay'
import { ValueFilters } from '../customer-value/ValueFilters'
import { ValueError } from '../customer-value/ValueRequestState'
import { ValuePageSkeleton } from '../customer-value/ValuePageSkeleton'
import { useValueRequest } from '../customer-value/useValueRequest'
import { valueAnalysisGrid } from '../customer-value/valueLayout'
import { atRisk, engagementGroups, percent } from './engagement'
import { EngagementSegments, EngagementTrend } from './RetentionCharts'
import { RetentionHouseholds } from './RetentionHouseholds'

function RetentionOverviewCards({ data }: { data: RetentionOverview }) {
  const counts = data.trend.at(-1)
  const total = data.households.length
  const cards = [
    { label: 'Households', value: total, help: 'Households matching the selected filters.' },
    {
      label: 'Active',
      value: counts?.active,
      help: 'Made a purchase 0–90 days before the date shown.',
    },
    {
      label: 'At risk',
      value: counts?.at_risk,
      help: 'Last purchased 91–180 days before the date shown.',
    },
    {
      label: 'Inactive',
      value: counts?.inactive,
      help: 'Last purchased more than 180 days before the date shown.',
    },
  ]

  return (
    <Panel aria-labelledby="retention-overview">
      <PanelHeading
        id="retention-overview"
        title="Retention & Churn"
        icon="/customers"
        className="relative"
      >
        Review observed purchasing activity and see where a validated forecast is available.
      </PanelHeading>
      <p className="mt-2 text-sm text-muted">
        Observed as of {data.as_of ? dateLabel(data.as_of) : '—'}
        {counts?.no_purchase
          ? ` · ${numberLabel(counts.no_purchase)} with no recorded purchase`
          : ''}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, help }) => (
          <div key={label} className="rounded-xl border border-line bg-canvas p-3">
            <dt className="relative flex items-center gap-2 text-xs font-semibold text-nav">
              {label}
              <InfoTooltip label={label}>{help}</InfoTooltip>
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-2 text-xl font-semibold tabular-nums">
              {value == null ? '—' : numberLabel(value)}
              {label !== 'Households' && value != null && total > 0 && (
                <span className="rounded bg-nav-selected px-1.5 py-0.5 text-xs font-medium text-link">
                  {percent(value / total)}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

function ChurnOutlook({ data }: { data: RetentionOverview }) {
  const { evidence } = data
  const available = isAvailable(evidence) && evidence.as_of
  const scores = data.households.flatMap(({ churn_risk }) =>
    churn_risk == null ? [] : [churn_risk],
  )
  const flagged = scores.filter((score) => score >= data.risk_threshold).length
  return (
    <Panel aria-labelledby="retention-outlook">
      <PanelHeading
        id="retention-outlook"
        title="Churn outlook"
        icon="/forecast"
        className="relative"
      >
        The forecast estimates the chance of no purchase over the next {evidence.horizon_days} days
        among eligible households.
      </PanelHeading>
      {available ? (
        <>
          <p className="mt-2 text-sm text-muted">
            {dateAfter(available, 1)} – {dateAfter(available, evidence.horizon_days)}
          </p>
          <dl className="mt-3 divide-y divide-line text-sm">
            <div className="flex justify-between gap-2 py-2">
              <dt>Households screened</dt>
              <dd className="font-semibold">{numberLabel(scores.length)}</dd>
            </div>
            <div className="flex justify-between gap-2 py-2">
              <dt>Risk of {percent(data.risk_threshold)} or higher</dt>
              <dd className="font-semibold">{numberLabel(flagged)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs break-all text-muted">Evaluated model · {evidence.version}</p>
        </>
      ) : (
        <div className="mt-3 text-sm">
          <p className="font-semibold">
            {evidence.status === 'available' ? 'Unavailable' : statusLabels[evidence.status]}
          </p>
          <p className="mt-1 text-muted">
            {evidence.status === 'stale'
              ? 'The source data changed after this model was published.'
              : 'A validated churn forecast is not available for this data.'}
          </p>
        </div>
      )}
    </Panel>
  )
}

function RetentionInsights({ data }: { data: RetentionOverview }) {
  const counts = data.trend.at(-1)
  const total = data.households.length
  const atRiskShare = total && counts ? percent(counts.at_risk / total) : null

  return (
    <Panel aria-labelledby="retention-insights">
      <PanelHeading
        id="retention-insights"
        title="Key takeaways & next steps"
        icon="checklist"
        className="relative"
      >
        Use observed activity to decide which households to investigate first.
      </PanelHeading>
      {counts && total > 0 ? (
        <TakeawayList
          items={[
            {
              icon: '/customers',
              title: 'Recent shoppers',
              tone: 'positive',
              detail: `${percent(counts.active / total)} of households purchased in the last 90 days.`,
            },
            {
              icon: 'clock',
              title: 'Review long purchase gaps',
              tone: 'violet',
              detail: `${numberLabel(counts.at_risk)} households (${atRiskShare}) last purchased 91–180 days ago. Start with their recent purchase activity in Household 360.`,
            },
            ...(counts.at_risk
              ? [
                  {
                    icon: 'search' as const,
                    title: 'Compare shopping frequency',
                    tone: 'blue' as const,
                    detail:
                      'Sort the household list by purchase days to distinguish regular shoppers with a recent gap from households that rarely shopped.',
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <p className="mt-3 text-sm text-muted">
          Activity takeaways need at least 180 days of history and a matching household.
        </p>
      )}
    </Panel>
  )
}

function RiskDrivers({ data }: { data: RetentionOverview }) {
  const counts = data.trend.at(-1)
  const observedAtRisk = data.households.filter(atRisk)
  const averageDays = observedAtRisk.length
    ? numberLabel(
        Math.round(
          observedAtRisk.reduce((sum, row) => sum + row.purchase_days_180d, 0) /
            observedAtRisk.length,
        ),
      )
    : null
  return (
    <Panel aria-labelledby="retention-drivers">
      <PanelHeading
        id="retention-drivers"
        title="Signals to investigate"
        icon="search"
        className="relative"
      >
        Use these purchase patterns to decide where to look first.
      </PanelHeading>
      <dl className="mt-3 divide-y divide-line text-sm">
        {[
          [
            'Purchase gap',
            counts ? `${numberLabel(counts.at_risk)} households · 91–180 days` : '—',
          ],
          [
            'Shopping frequency',
            counts && averageDays
              ? `${averageDays} purchase days on average over 180 days for at-risk households.`
              : '—',
          ],
          ['Recent spending', 'Review 90-day net spend alongside the last purchase date.'],
        ].map(([label, detail]) => (
          <div key={label} className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
            <dt className="font-semibold">{label}</dt>
            <dd className="text-muted">{detail}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

export function RetentionPage() {
  const [params, setParams] = useSearchParams()
  const filterKey = params.toString()
  const cohort = useMemo(() => {
    const search = new URLSearchParams(filterKey)
    const segment = (Object.keys(segmentLabels) as (keyof typeof segmentLabels)[]).find(
      (value) => value === search.get('segment'),
    )
    return { ...readCohort(search), segment }
  }, [filterKey])
  const load = useCallback((signal: AbortSignal) => getRetention(cohort, signal), [cohort])
  const { result, previousData, retry } = useValueRequest(load)
  const data = result ? result.data : previousData
  const updating = !result && Boolean(data)

  return (
    <div className="space-y-3 md:space-y-4">
      <WorkspaceHeader
        path={customerIntelligencePath}
        status={updating ? 'Updating household activity…' : undefined}
      />
      <CustomerTabs />
      <ValueFilters
        showSegment
        key={filterKey}
        cohort={cohort}
        updating={updating}
        apply={(next) => setParams(next)}
      />
      {!result && !data && <ValuePageSkeleton label="Loading household activity…" />}
      {result?.error && <ValueError message="Could not load retention activity." retry={retry} />}
      {data && (
        <div aria-busy={updating} inert={updating} className="space-y-3 md:space-y-4">
          <RetentionOverviewCards data={data} />
          <div className={valueAnalysisGrid}>
            <EngagementTrend trend={data.trend} />
            <EngagementSegments segments={data.segments} />
            <ChurnOutlook data={data} />
          </div>
          <div className="grid items-start gap-3 md:gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <RetentionHouseholds key={filterKey} data={data} />
            <div className="space-y-3 md:space-y-4">
              <RetentionInsights data={data} />
              <RiskDrivers data={data} />
            </div>
          </div>
          <p className="text-xs text-muted">
            {engagementGroups.map(({ label }) => label).join(', ')} describe past purchase activity.
            Predicted churn looks ahead.
          </p>
        </div>
      )}
    </div>
  )
}
