import type { ComponentProps, ReactNode } from 'react'
import { InfoTooltip } from './InfoTooltip'
import { Icon, type IconName } from './WorkspaceIcon'

export function Panel({ className = '', ...props }: ComponentProps<'section'>) {
  return (
    <section
      {...props}
      className={`min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5 ${className}`}
    />
  )
}

export function PanelHeading({
  id,
  title,
  icon,
  children,
  helpLabel = title,
  className = '',
}: {
  id: string
  title: string
  icon: IconName
  children: ReactNode
  helpLabel?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <h2 id={id} className="flex items-center gap-2 font-semibold">
        <Icon name={icon} className="size-5 text-brand" />
        {title}
      </h2>
      <InfoTooltip label={helpLabel}>{children}</InfoTooltip>
    </div>
  )
}
