import type { ModelSummary } from '../../api/customerValue'
import { Panel, PanelHeading } from '../../components/Panel'
import { TakeawayList, type Takeaway } from '../../components/TakeawayList'
import { moneyLabel, numberLabel } from '../../lib/format'
import { isAvailable, loyaltyLabel, observedChange, spendingSegments } from './valueDisplay'

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function ValueInsights({ summary }: { summary: ModelSummary }) {
  const items: Takeaway[] = []
  const change = observedChange(summary)
  if (change) {
    const difference =
      change.percent === null
        ? moneyLabel(Math.abs(change.amount))
        : percent.format(Math.abs(change.percent) / 100)
    items.push({
      icon: '/forecast',
      title: 'How net spend changed',
      detail:
        change.amount === 0
          ? 'Net spend was the same in both 90-day periods.'
          : `Net spend ${change.amount > 0 ? 'rose' : 'fell'} by ${difference} compared with the previous 90 days.`,
      tone: change.amount < 0 ? 'negative' : 'positive',
    })
  }

  const [highest, second] = spendingSegments(summary)
  if (highest && second) {
    const gap = highest.average - second.average
    items.push({
      icon: '/customers',
      title: 'Which group spent more per household',
      detail:
        gap === 0
          ? `${loyaltyLabel(highest.loyalty_flag)} and ${loyaltyLabel(second.loyalty_flag).toLowerCase()} had the same average spend.`
          : `${loyaltyLabel(highest.loyalty_flag)} averaged ${moneyLabel(highest.average)} over the last 90 days, ${moneyLabel(gap)} more than ${loyaltyLabel(second.loyalty_flag).toLowerCase()}.`,
      tone: 'blue',
    })
  }

  if (isAvailable(summary.evidence) && summary.scored_households > 0) {
    items.push({
      icon: 'calendar',
      title: 'Who has a 90-day outlook',
      detail: `${numberLabel(summary.scored_households)} of ${numberLabel(summary.observed_households)} households have a forecast. Open a household to see its forecast alongside recorded spending.`,
      tone: 'violet',
    })
  }

  if (items.length === 0) return null

  return (
    <Panel aria-labelledby="clv-insights" className="@container">
      <PanelHeading id="clv-insights" title="Key takeaways" icon="checklist" />
      <TakeawayList items={items} />
      {summary.evidence.version && (
        <a
          className="mt-3 inline-block rounded-lg bg-nav-selected px-3 py-1.5 text-xs font-semibold text-link no-underline hover:underline"
          href="#household-spending"
        >
          Review households →
        </a>
      )}
    </Panel>
  )
}
