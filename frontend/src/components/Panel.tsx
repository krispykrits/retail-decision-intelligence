import type { ComponentProps } from 'react'

export function Panel({ className = '', ...props }: ComponentProps<'section'>) {
  return (
    <section
      {...props}
      className={`min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5 ${className}`}
    />
  )
}
