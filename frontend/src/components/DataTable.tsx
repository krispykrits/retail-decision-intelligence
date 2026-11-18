import type { ReactNode } from 'react'

type DataTableProps = {
  columns: Readonly<Record<string, ReactNode>>
  children: ReactNode
  busy?: boolean
  className?: string
}

export function DataTable({ columns, children, busy, className = '' }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line" aria-busy={busy}>
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
