import { useState } from 'react'

type ChartPoint = { index: number; value: number; label: string }
type ChartSeries = { id: string; label: string; points: ChartPoint[]; dashed?: boolean }

const width = 540
const height = 260
const left = 90
const right = width - 26
const top = 16
const bottom = height - 33

function yAxis(low: number, high: number) {
  const upper = low === high ? low + 1 : high
  const roughStep = (upper - low) / 5
  const scale = 10 ** Math.floor(Math.log10(roughStep))
  const step = scale * ([5, 2.5, 2, 1].find((size) => size <= roughStep / scale) ?? 1)
  const first = Math.floor(low / step)
  const last = Math.ceil(upper / step)
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step)
}

export function TrendChart({
  label,
  series,
  ticks,
  format,
}: {
  label: string
  series: ChartSeries[]
  ticks: { index: number; label: string }[]
  format: (value: number) => string
}) {
  const [selected, setSelected] = useState<number>()
  const [preview, setPreview] = useState<number>()
  const activeIndex = selected ?? preview
  const points = series.flatMap((line) => line.points)
  if (points.length === 0) return null
  const active = points.some((point) => point.index === activeIndex) ? activeIndex : undefined

  const low = points.reduce((value, point) => Math.min(value, point.value), 0)
  const high = points.reduce((value, point) => Math.max(value, point.value), 0)
  const grid = yAxis(low, high)
  const floor = grid[0]
  const span = grid[grid.length - 1] - floor
  const end = points.reduce((index, point) => Math.max(index, point.index), 0)
  const x = (index: number) => (end ? left + (index / end) * (right - left) : (left + right) / 2)
  const y = (value: number) => bottom - ((value - floor) / span) * (bottom - top)
  const firstTick = ticks[0]
  const lastTick = ticks.at(-1)
  const spacing = end * 0.24
  const middleTick = ticks[Math.floor(ticks.length / 2)]
  const visibleTicks = firstTick ? [firstTick] : []
  if (firstTick && lastTick && lastTick.index - firstTick.index > spacing) {
    if (middleTick.index - firstTick.index > spacing && lastTick.index - middleTick.index > spacing)
      visibleTicks.push(middleTick)
    visibleTicks.push(lastTick)
  }
  const activePoints = series
    .map((line) => ({
      id: line.id,
      label: line.label,
      point: line.points.find((point) => point.index === active),
    }))
    .sort((left, right) => Number(left.id === 'prior') - Number(right.id === 'prior'))
  const current = activePoints.find((line) => line.id === 'current')?.point
  const prior = activePoints.find((line) => line.id === 'prior')?.point
  const difference = current && prior ? current.value - prior.value : undefined

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="group"
        aria-label={label}
        onPointerLeave={() => setPreview(undefined)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setSelected(undefined)
            setPreview(undefined)
          }
        }}
      >
        {grid.map((value) => (
          <g key={value} aria-hidden="true">
            <line
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              className={value === 0 ? 'stroke-field-line' : 'stroke-line'}
            />
            <text
              x={left - 7}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted text-[12px]"
            >
              {format(value)}
            </text>
          </g>
        ))}
        {visibleTicks.map((tick) => (
          <text
            aria-hidden="true"
            key={tick.index}
            x={x(tick.index)}
            y={bottom + 20}
            textAnchor={
              tick.index === end && end > 0
                ? 'end'
                : tick.index === 0 && end > 0
                  ? 'start'
                  : 'middle'
            }
            className="fill-muted text-[12px]"
          >
            {tick.label}
          </text>
        ))}
        {active !== undefined && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={top}
            y2={bottom}
            strokeDasharray="4 4"
            className="pointer-events-none stroke-field-line"
            aria-hidden="true"
          />
        )}
        {series.map((line) => {
          // Start a new segment after an unobserved bucket.
          const path = line.points
            .map((point, index) => {
              const connected = point.index === line.points[index - 1]?.index + 1
              return `${connected ? 'L' : 'M'}${x(point.index)},${y(point.value)}`
            })
            .join(' ')
          const color = line.dashed ? 'text-muted' : 'text-brand'
          return (
            <g key={line.id} className={color}>
              <path
                aria-hidden="true"
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={line.dashed ? '5 4' : undefined}
              />
              {line.points.map((point) => {
                return (
                  <circle
                    key={point.index}
                    cx={x(point.index)}
                    cy={y(point.value)}
                    r={active === point.index ? 6 : 3.5}
                    fill={active === point.index ? 'currentColor' : 'white'}
                    stroke="currentColor"
                    strokeWidth="2"
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected === point.index}
                    aria-label={`${line.label}, ${point.label}, ${format(point.value)}`}
                    className="cursor-pointer focus-visible:outline-focus"
                    onFocus={() => setPreview(point.index)}
                    onPointerEnter={() => setPreview(point.index)}
                    onClick={() => setSelected(point.index)}
                    onBlur={() => setPreview(undefined)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelected(point.index)
                      }
                    }}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
      <ul
        className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted"
        aria-label="Chart legend"
      >
        {series.map((line) => (
          <li key={line.id} className="flex items-center gap-2">
            <span
              className={`w-5 border-t-2 ${line.dashed ? 'border-dashed border-muted' : 'border-brand'}`}
              aria-hidden="true"
            />
            {line.label}
          </li>
        ))}
      </ul>
      <figcaption
        className="mt-2 min-h-7 rounded-md bg-canvas px-2 py-1 text-xs text-muted"
        aria-live="polite"
      >
        {active === undefined ? (
          'Select a point to compare periods.'
        ) : (
          <dl className="space-y-1">
            {activePoints.map(({ id, label, point }) => (
              <div key={id} className="flex flex-wrap justify-between gap-x-3">
                <dt>
                  {label}
                  {point && ` · ${point.label}`}
                </dt>
                <dd className="font-medium text-ink">
                  {point ? format(point.value) : 'Unavailable'}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-x-3 border-t border-line pt-1 font-semibold text-ink">
              <dt>Difference</dt>
              <dd>
                {difference === undefined
                  ? 'Unavailable'
                  : `${difference > 0 ? '+' : ''}${format(difference)}`}
              </dd>
            </div>
          </dl>
        )}
      </figcaption>
    </figure>
  )
}
