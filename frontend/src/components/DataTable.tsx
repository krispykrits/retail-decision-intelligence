import type { ReactNode } from 'react'

type DataTableProps = {
  columns: Readonly<Record<string, ReactNode>>
  children: ReactNode
  busy?: boolean
  className?: string
  viewportClassName?: string
  viewportLabel?: string
}

export function DataTable({
  columns,
  children,
  busy,
  className = '',
  viewportClassName = '',
  viewportLabel,
}: DataTableProps) {
  return (
    <div
      className={`overflow-auto rounded-xl border border-line ${viewportClassName}`}
      aria-busy={busy}
      aria-label={viewportLabel}
      role={viewportLabel ? 'region' : undefined}
      tabIndex={viewportLabel ? 0 : undefined}
    >
      <table
        className={`w-full text-left text-sm [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-2 ${className}`}
      >
        <thead className="border-b border-line bg-canvas text-nav">
          <tr>
            {Object.entries(columns).map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
