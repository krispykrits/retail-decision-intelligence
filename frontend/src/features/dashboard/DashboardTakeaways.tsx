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
    items.push({
      icon: '/forecast',
      title: amount === 0 ? 'Net spend held steady' : `Net spend ${amount > 0 ? 'rose' : 'fell'}`,
      detail: `${spend.percent == null ? valueLabel('spend', spend.amount) : percentLabel(spend.percent)} vs. the prior period.`,
      color: amount < 0 ? 'bg-red-50 text-error' : 'bg-emerald-50 text-success',
    })
  }
  if (leader?.current) {
    const share =
      leader.share === null || leader.share === undefined
        ? ''
        : ` · ${Number(leader.share).toFixed(1)}% of net spend`
    items.push({
      icon: '/merchandise',
      title: `${leader.name} led net spend`,
      detail: `${valueLabel('spend', leader.current.spend)}${share}.`,
      color: 'bg-sky-50 text-sky-800',
    })
  }
  if (cohorts) {
    items.push({
      icon: '/customers',
      title: 'Households across periods',
      detail: `${cohorts.active_in_both} in both · ${cohorts.active_only_in_current} selected only · ${cohorts.active_only_in_previous} prior only.`,
      color: 'bg-violet-50 text-violet-800',
    })
  }
  if (inactive) {
    items.push({
      icon: '/households',
      title: `${valueLabel('households', inactive.inactive)} households inactive`,
      detail: `${valueLabel('households', inactive.eligible)} households assessed. Inactive for ${inactive.days}+ days as of ${dateLabel(inactive.as_of)}.`,
      color: 'bg-violet-50 text-violet-800',
    })
  }

  return (
    <Panel aria-labelledby="takeaways-title" className="lg:col-span-2 2xl:col-span-1">
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
