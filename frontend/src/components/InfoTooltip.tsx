import { type ReactNode, useId } from 'react'

export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()

  return (
    <span className="group inline-flex shrink-0">
      <button
        type="button"
        aria-label={`How ${label} is determined`}
        aria-describedby={id}
        className="grid size-4 cursor-help place-items-center rounded-full border border-field-line text-[0.65rem] leading-none font-semibold text-muted hover:border-brand hover:text-brand"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className="absolute top-full left-0 z-20 hidden w-72 max-w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed font-normal text-ink shadow-panel group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  )
}
