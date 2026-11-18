import { useState } from 'react'
import type { Dashboard } from '../../api/dashboard'
import { DataTable } from '../../components/DataTable'
import { Panel } from '../../components/Panel'
import { WorkspaceIcon } from '../../components/WorkspaceIcon'
import { percentLabel, valueLabel } from './format'

const colors = ['#1848a5', '#2870ce', '#4389df', '#69a8f0', '#a2ccfc', '#b4c1d4']
const donutWidth = 228
const donutHeight = 176
const centerX = donutWidth / 2
const centerY = donutHeight / 2
const radius = 77
const labelGap = 15
const minimumInlineShare = 7

const sliceColor = (index: number) =>
  colors[index === 0 ? 0 : 1 + ((index - 1) % (colors.length - 1))]

export function DashboardBreakdown({
  breakdown,
  netSpend,
}: {
  breakdown: Dashboard['breakdown']
  netSpend: string
}) {
  const [selectedName, setSelectedName] = useState<string>()
  const isDepartment = breakdown.dimension === 'department'
  const rows = breakdown.rows
  const magnitudes = rows.map((row) => Number(row.current?.spend ?? 0))
  const maximum = magnitudes.reduce((highest, value) => Math.max(highest, Math.abs(value)), 0)
  const signed = magnitudes.some((value) => value < 0)
  const slices = []
  let end = 0
  for (const [index, row] of rows.entries()) {
    const { name } = row
    const share = Number(row.share ?? 0)
    if (share <= 0) continue
    const start = end
    end += share
    const angle = ((start + share / 2) / 100) * 2 * Math.PI
    const color = sliceColor(index)
    slices.push({
      name,
      share,
      start,
      end,
      color,
      angle,
      x: centerX + radius * Math.sin(angle),
      y: centerY - radius * Math.cos(angle),
    })
  }
  const selected = slices.find(({ name }) => name === selectedName)
  const showSmallLabels = slices.length <= colors.length
  const labels = []
  for (const left of [true, false]) {
    const side = slices
      .filter(
        ({ share, x }) =>
          showSmallLabels && share < minimumInlineShare && (left ? x < centerX : x >= centerX),
      )
      .sort((a, b) => a.y - b.y)
    let previousY = 10 - labelGap
    for (const [index, slice] of side.entries()) {
      const maxY = donutHeight - 10 - (side.length - 1 - index) * labelGap
      const y = Math.max(previousY + labelGap, Math.min(slice.y, maxY))
      labels.push({ ...slice, left, labelY: y })
      previousY = y
    }
  }
  const showDonut = slices.length > 0 && !signed
  const columns = {
    name: isDepartment ? 'Department' : 'Commodity',
    spend: 'Net spend',
    comparison: 'Change',
  }
  return (
    <Panel aria-labelledby="breakdown-title" className="flex flex-col">
      <h2 id="breakdown-title" className="flex items-center gap-2 font-semibold">
        <WorkspaceIcon path="/merchandise" className="size-5 text-brand" />
        {isDepartment ? 'Department contribution' : 'Commodity contribution'}
      </h2>
      <p className="mt-1 mb-3 text-sm text-muted">
        {signed
          ? 'Negative bars show net returns and adjustments.'
          : 'Net spend and share of the selected period.'}
      </p>
      <div
        className={`grid flex-1 content-start gap-4 ${showDonut ? 'lg:grid-cols-[minmax(7rem,1fr)_minmax(11rem,1fr)] lg:items-start' : ''}`}
      >
        {showDonut && (
          <figure
            aria-label="Share of net spend"
            className="relative mx-auto grid w-full max-w-56 place-items-center lg:max-w-64"
            style={{ aspectRatio: `${donutWidth} / ${donutHeight}` }}
          >
            <div
              className="grid aspect-square place-items-center rounded-full"
              style={{
                width: `${(2 * radius * 100) / donutWidth}%`,
                background: `conic-gradient(${slices
                  .map(
                    ({ name, color, start, end }) =>
                      `${selected && selected.name !== name ? `${color}38` : color} ${start}% ${end}%`,
                  )
                  .join(', ')})`,
              }}
            >
              <div
                className="grid size-[66%] place-content-center rounded-full bg-surface px-1 text-center"
                aria-live="polite"
              >
                <span className="text-xs font-semibold tabular-nums">
                  {selected ? `${selected.share.toFixed(1)}%` : valueLabel('spend', netSpend)}
                </span>
                <span
                  className="line-clamp-2 text-[0.65rem] leading-tight wrap-break-word text-muted"
                  title={selected?.name}
                >
                  {selected?.name ?? 'Net spend'}
                </span>
              </div>
            </div>
            <svg
              viewBox={`0 0 ${donutWidth} ${donutHeight}`}
              className="pointer-events-none absolute inset-0 size-full"
            >
              {slices
                .filter(({ share }) => !selected && share >= minimumInlineShare)
                .map(({ name, share, color, angle }) => {
                  const percentage = `${share.toFixed(1)}%`
                  const labelRadius = radius * 0.83
                  const darkSlice = color === colors[0] || color === colors[1]
                  return (
                    <text
                      key={name}
                      x={centerX + labelRadius * Math.sin(angle)}
                      y={centerY - labelRadius * Math.cos(angle)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      aria-label={`${name} ${percentage}`}
                      className={`text-[11px] font-semibold tabular-nums ${darkSlice ? 'fill-white' : 'fill-ink'}`}
                    >
                      {percentage}
                    </text>
                  )
                })}
              {!selected &&
                labels.map(({ name, share, x, y, left, labelY }) => {
                  const elbow = left ? 36 : donutWidth - 36
                  const textX = elbow + (left ? -3 : 3)
                  const percentage = `${share.toFixed(1)}%`
                  return (
                    <g key={name}>
                      <path
                        d={`M ${x} ${y} L ${elbow} ${labelY}`}
                        className="stroke-muted"
                        fill="none"
                        aria-hidden="true"
                      />
                      <text
                        x={textX}
                        y={labelY}
                        textAnchor={left ? 'end' : 'start'}
                        dominantBaseline="middle"
                        aria-label={`${name} ${percentage}`}
                        className="fill-ink text-[11px] font-semibold tabular-nums"
                      >
                        {percentage}
                      </text>
                    </g>
                  )
                })}
            </svg>
          </figure>
        )}
        <div className="min-w-0">
          <DataTable
            columns={columns}
            className="text-xs [&_:is(th,td)]:px-1.5! [&_:is(th,td)]:py-1.5! [&_:is(th,td):not(:first-child)]:text-right [&_thead]:sticky [&_thead]:top-0 [&_thead]:bg-surface"
            viewportClassName="max-h-52 rounded-none! border-0! focus-visible:outline-2 focus-visible:outline-focus"
            viewportLabel={
              isDepartment ? 'Department contribution rows' : 'Commodity contribution rows'
            }
          >
            {rows.map((row, index) => {
              const amount = Number(row.current?.spend ?? 0)
              const width = maximum > 0 ? (Math.abs(amount) / maximum) * (signed ? 50 : 100) : 0
              const canFocusSlice = !isDepartment && showDonut && Number(row.share) > 0
              const focused = selected?.name === row.name
              return (
                <tr key={row.name} className={focused ? 'bg-nav-selected' : undefined}>
                  <th scope="row" className="font-medium">
                    <span className="flex items-start gap-1.5">
                      {showDonut && row.share != null && (
                        <span
                          className="mt-0.5 size-2 shrink-0 rounded-xs"
                          style={{ backgroundColor: sliceColor(index) }}
                          aria-hidden="true"
                        />
                      )}
                      {canFocusSlice ? (
                        <button
                          type="button"
                          aria-pressed={focused}
                          onClick={() => setSelectedName(focused ? undefined : row.name)}
                          className="cursor-pointer text-left text-link underline-offset-2 hover:underline"
                        >
                          {row.name}
                        </button>
                      ) : (
                        row.name
                      )}
                    </span>
                  </th>
                  <td className="whitespace-nowrap">
                    {row.current ? (
                      <>
                        <span className="font-medium tabular-nums">
                          {valueLabel('spend', row.current.spend)}
                        </span>
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
