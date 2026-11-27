import type { Dashboard } from '../../api/dashboard'
import { Panel, PanelHeading } from '../../components/Panel'
import { TakeawayList, type Takeaway } from '../../components/TakeawayList'
import { dateLabel, percentLabel, valueLabel } from './format'

export function DashboardTakeaways({
  summary,
  breakdown,
  region,
  department,
}: Pick<Dashboard, 'summary' | 'breakdown'> & {
  region?: string | null
  department?: string | null
}) {
  const scope = [region, department].filter(Boolean).join(' · ')
  const spend = summary.changes.spend
  const leader = breakdown.rows.find((row) => row.current && Number(row.current.spend) > 0)
  const inactive = summary.inactivity
  const cohorts = summary.cohorts
  const items: Takeaway[] = []

  if (spend) {
    const amount = Number(spend.amount)
    const change =
      spend.percent == null
        ? valueLabel('spend', Math.abs(amount))
        : percentLabel(spend.percent).replace(/^[+-]/, '')
    items.push({
      icon: '/forecast',
      title: 'How net spend changed',
      detail:
        amount === 0
          ? 'Net spend was the same in both periods.'
          : `Net spend ${amount > 0 ? 'rose' : 'fell'} by ${change} compared with the prior period.`,
      tone: amount < 0 ? 'negative' : 'positive',
    })
  }
  if (leader?.current) {
    const share =
      leader.share === null || leader.share === undefined
        ? ''
        : `, or ${Number(leader.share).toFixed(1)}% of net spend in the selected period`
    items.push({
      icon: '/merchandise',
      title: department ? 'Which commodity led net spend' : 'Which department led net spend',
      detail: `${leader.name} had the highest net spend at ${valueLabel('spend', leader.current.spend)}${share}.`,
      tone: 'blue',
    })
  }
  if (cohorts) {
    items.push({
      icon: '/customers',
      title: 'Who shopped in each period',
      detail: `${valueLabel('households', cohorts.active_in_both)} shopped in both periods. ${valueLabel('households', cohorts.active_only_in_current)} shopped only in the selected period and ${valueLabel('households', cohorts.active_only_in_previous)} only in the prior period.`,
      tone: 'violet',
    })
  }
  if (inactive) {
    items.push({
      icon: 'clock',
      title: 'How many households haven’t shopped recently',
      detail: `As of ${dateLabel(inactive.as_of)}, ${valueLabel('households', inactive.inactive)} of ${valueLabel('households', inactive.eligible)} households had gone at least ${inactive.days} days without a purchase.`,
      tone: 'violet',
    })
  }

  return (
    <Panel aria-labelledby="takeaways-title" className="@container">
      <PanelHeading
        id="takeaways-title"
        title="Key takeaways"
        icon="checklist"
        helpLabel="Key Takeaways"
        className="relative mb-2 text-base"
      >
        Uses matching transactions to compare net spend and household activity and identify the
        leading category. Inactivity compares each household’s last matching purchase with the
        cutoff shown in the card.
      </PanelHeading>
      {scope && <p className="text-xs text-muted">{scope}</p>}
      {items.length ? (
        <TakeawayList items={items} />
      ) : (
        <p className="text-sm text-muted">The selected data doesn’t support a takeaway yet.</p>
      )}
    </Panel>
  )
}
