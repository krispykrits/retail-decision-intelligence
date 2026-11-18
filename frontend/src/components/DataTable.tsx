import type { ReactNode } from 'react'

type DataTableProps = {
  columns: Readonly<Record<string, ReactNode>>
  children: ReactNode
  busy?: boolean
  className?: string
}

export function DataTable({ columns, children, busy, className = '' }: DataTableProps) {
  return (
    <div className="overflow-x-auto" aria-busy={busy}>
      <table
        className={`w-full text-left text-sm [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-2 ${className}`}
      >
        <thead className="bg-canvas">
          <tr>
            {Object.entries(columns).map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-b border-line">{children}</tbody>
      </table>
    </div>
  )
}
