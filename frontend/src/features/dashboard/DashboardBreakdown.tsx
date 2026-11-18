import { Link } from 'react-router-dom'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { percentLabel, valueLabel } from './format'

const colors = ['#1848a5', '#2870ce', '#4389df', '#69a8f0', '#a2ccfc', '#b4c1d4']
const sliceColor = (index: number) => colors[Math.min(index, colors.length - 1)]

export function DashboardBreakdown({
  breakdown,
  netSpend,
  departmentLink,
}: {
  breakdown: Dashboard['breakdown']
  netSpend: string
  departmentLink: (name: string) => string
}) {
  const isDepartment = breakdown.dimension === 'department'
  const rows = breakdown.rows
  const magnitudes = rows.map((row) => Number(row.current?.spend ?? 0))
  const maximum = magnitudes.reduce((highest, value) => Math.max(highest, Math.abs(value)), 0)
  const signed = magnitudes.some((value) => value < 0)
  const slices: string[] = []
  let end = 0
  for (const [index, row] of rows.entries()) {
    if (row.share == null) continue
    const start = end
    end += Number(row.share)
    slices.push(`${sliceColor(index)} ${start}% ${end}%`)
  }
  const showDonut = slices.length > 0 && !signed
  const columns = {
    name: isDepartment ? 'Department' : 'Commodity',
    spend: 'Net spend',
    comparison: 'Change',
  }
  return (
    <Panel aria-labelledby="breakdown-title" className="@container">
      <h2 id="breakdown-title" className="flex items-center gap-2 font-semibold">
        <WorkspaceIcon path="/merchandise" className="size-5 text-brand" />
        {isDepartment ? 'Department contribution' : 'Commodity contribution'}
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {signed
          ? 'Negative bars show net returns and adjustments.'
          : 'Net spend and share of the selected period.'}
      </p>
      <div
        className={`grid items-start gap-3 ${showDonut ? '@[26rem]:grid-cols-[minmax(7.5rem,1fr)_minmax(0,2fr)]' : ''}`}
      >
        {showDonut && (
          <div
            className="relative mx-auto grid aspect-square w-36 max-w-full place-items-center rounded-full @[26rem]:mt-3 @[26rem]:w-full @[26rem]:max-w-44"
            style={{ background: `conic-gradient(${slices.join(', ')})` }}
            aria-hidden="true"
          >
            <div className="grid size-[65%] place-content-center rounded-full bg-surface text-center">
              <span className="text-sm font-semibold tabular-nums">
                {valueLabel('spend', netSpend)}
              </span>
              <span className="text-[0.65rem] text-muted">Net spend</span>
            </div>
          </div>
        )}
        <div className="min-w-0">
          <DataTable
            columns={columns}
            className="text-xs [&_:is(th,td)]:px-2 [&_thead]:sticky [&_thead]:top-0"
            viewportClassName="max-h-56 focus-visible:outline-2 focus-visible:outline-focus"
            viewportLabel={
              isDepartment ? 'Department contribution rows' : 'Commodity contribution rows'
            }
          >
            {rows.map((row, index) => {
              const amount = Number(row.current?.spend ?? 0)
              const width = maximum > 0 ? (Math.abs(amount) / maximum) * (signed ? 50 : 100) : 0
              return (
                <tr key={row.name}>
                  <th scope="row" className="font-medium">
                    <span className="flex items-start gap-1.5">
                      {showDonut && row.share != null && (
                        <span
                          className="mt-1 size-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: sliceColor(index) }}
                          aria-hidden="true"
                        />
                      )}
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
                    </span>
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
                        {!showDonut && (
                          <div className="relative mt-1 h-1.5 rounded bg-canvas" aria-hidden="true">
                            <span
                              className={`absolute h-full rounded ${amount < 0 ? 'bg-error' : 'bg-brand'}`}
                              style={{
                                width: `${width}%`,
                                left: `${signed ? 50 - (amount < 0 ? width : 0) : 0}%`,
                              }}
                            />
                          </div>
                        )}
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
      </div>
    </Panel>
  )
}
