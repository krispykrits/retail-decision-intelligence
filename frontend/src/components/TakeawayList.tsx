import { Icon, type IconName } from './WorkspaceIcon'

const tones = {
  positive: 'bg-emerald-50 text-success',
  negative: 'bg-red-50 text-error',
  blue: 'bg-sky-50 text-sky-800',
  violet: 'bg-violet-50 text-violet-800',
} as const

export type Takeaway = {
  icon: IconName
  title: string
  detail: string
  tone: keyof typeof tones
}

export function TakeawayList({ items }: { items: Takeaway[] }) {
  return (
    <ul className="divide-y divide-line @[26rem]:grid @[26rem]:grid-cols-2 @[26rem]:gap-x-4 @[26rem]:divide-none">
      {items.map(({ icon, title, detail, tone }) => (
        <li key={title} className="flex items-start gap-2.5 py-2.5 last:pb-0">
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
            <Icon name={icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold break-words">{title}</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
