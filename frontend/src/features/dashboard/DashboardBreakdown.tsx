import { Link } from 'react-router-dom'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel } from '../../components/Panel'
import { percentLabel, valueLabel } from './format'

export function DashboardBreakdown({
  breakdown,
  departmentLink,
}: {
  breakdown: Dashboard['breakdown']
  departmentLink: (name: string) => string
}) {
  const isDepartment = breakdown.dimension === 'department'
  const rows = breakdown.rows
  const magnitudes = rows.map((row) => Number(row.current?.spend ?? 0))
  const maximum = magnitudes.reduce((highest, value) => Math.max(highest, Math.abs(value)), 0)
  const signed = magnitudes.some((value) => value < 0)
  const columns = {
    name: isDepartment ? 'Department' : 'Commodity',
    spend: 'Net spend',
    comparison: 'Change',
  }
  return (
    <Panel aria-labelledby="breakdown-title">
      <h2 id="breakdown-title" className="font-semibold">
        {isDepartment ? 'Department contribution' : 'Commodity contribution'}
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {signed
          ? 'Negative bars show net returns and adjustments.'
          : 'Ranked by net spend in the selected period.'}
      </p>
      <div className="max-h-80 overflow-auto">
        <DataTable columns={columns}>
          {rows.map((row) => {
            const amount = Number(row.current?.spend ?? 0)
            const width = maximum > 0 ? (Math.abs(amount) / maximum) * (signed ? 50 : 100) : 0
            return (
              <tr key={row.name}>
                <th scope="row" className="font-medium">
                  {isDepartment ? (
                    <Link
                      to={departmentLink(row.name)}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                </th>
                <td className="min-w-24">
                  {row.current ? (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="font-medium tabular-nums">
                          {valueLabel('spend', row.current.spend)}
                        </span>
                        {row.share != null && (
                          <span className="text-xs text-muted">
                            {Number(row.share).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="relative mt-1 h-1.5 rounded bg-canvas" aria-hidden="true">
                        <span
                          className={`absolute h-full rounded ${amount < 0 ? 'bg-error' : 'bg-brand'}`}
                          style={{
                            width: `${width}%`,
                            left: `${signed ? 50 - (amount < 0 ? width : 0) : 0}%`,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  {row.change ? (
                    <span title={`Prior period ${valueLabel('spend', row.prior?.spend ?? 0)}`}>
                      {row.change.percent == null
                        ? valueLabel('spend', row.change.amount)
                        : percentLabel(row.change.percent)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </DataTable>
      </div>
    </Panel>
  )
}
