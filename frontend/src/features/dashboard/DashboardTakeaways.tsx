import type { Dashboard } from '../../api/dashboard'
import type { Workspace } from '../../app/workspaces'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { dateLabel, percentLabel, valueLabel } from './format'

export function DashboardTakeaways({
  summary,
  breakdown,
}: Pick<Dashboard, 'summary' | 'breakdown'>) {
  const spend = summary.changes.spend
  const leader = breakdown.rows.find((row) => row.current && Number(row.current.spend) > 0)
  const inactive = summary.inactivity
  const cohorts = summary.cohorts
  const items: { icon: Workspace['path']; title: string; detail: string; color: string }[] = []

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
      color: amount < 0 ? 'bg-red-50 text-error' : 'bg-emerald-50 text-success',
    })
  }
  if (leader?.current) {
    const share =
      leader.share === null || leader.share === undefined
        ? ''
        : `, or ${Number(leader.share).toFixed(1)}% of net spend in the selected period`
    items.push({
      icon: '/merchandise',
      title: 'Where shoppers spent the most',
      detail: `${leader.name} had the highest net spend at ${valueLabel('spend', leader.current.spend)}${share}.`,
      color: 'bg-sky-50 text-sky-800',
    })
  }
  if (cohorts) {
    items.push({
      icon: '/customers',
      title: 'Who shopped in each period',
      detail: `${valueLabel('households', cohorts.active_in_both)} shopped in both periods. ${valueLabel('households', cohorts.active_only_in_current)} shopped only in the selected period and ${valueLabel('households', cohorts.active_only_in_previous)} only in the prior period.`,
      color: 'bg-violet-50 text-violet-800',
    })
  }
  if (inactive) {
    items.push({
      icon: '/households',
      title: 'How many households haven’t shopped recently',
      detail: `As of ${dateLabel(inactive.as_of)}, ${valueLabel('households', inactive.inactive)} of ${valueLabel('households', inactive.eligible)} households had gone at least ${inactive.days} days without a purchase.`,
      color: 'bg-violet-50 text-violet-800',
    })
  }

  return (
    <Panel aria-labelledby="takeaways-title">
      <h2 id="takeaways-title" className="mb-2 flex items-center gap-2 text-base font-semibold">
        <WorkspaceIcon path="/command-center" className="size-5 text-brand" />
        Key takeaways
      </h2>
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map(({ icon, title, detail, color }) => (
            <li key={icon} className="flex items-start gap-2.5 py-2.5 last:pb-0">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${color}`}>
                <WorkspaceIcon path={icon} className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold break-words">{title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">The selected data doesn’t support a takeaway yet.</p>
      )}
    </Panel>
  )
}
