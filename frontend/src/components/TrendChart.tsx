import { useState } from 'react'

type ChartPoint = { index: number; value: number; label: string }
type ChartSeries = { id: string; label: string; points: ChartPoint[]; dashed?: boolean }

const width = 540
const height = 260
const left = 90
const right = width - 26
const top = 16
const bottom = height - 33

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
  const [active, setActive] = useState<{ point: ChartPoint; series: string }>()
  const points = series.flatMap((line) => line.points)
  if (points.length === 0) return null

  const low = points.reduce((value, point) => Math.min(value, point.value), 0)
  const high = points.reduce((value, point) => Math.max(value, point.value), 0)
  const span = high - low || 1
  const end = points.reduce((index, point) => Math.max(index, point.index), 0)
  const x = (index: number) => (end ? left + (index / end) * (right - left) : (left + right) / 2)
  const y = (value: number) => bottom - ((value - low) / span) * (bottom - top)
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
  const grid = [...new Set([low, low + span / 2, low + span, 0])]

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="group" aria-label={label}>
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
                const show = () => setActive({ point, series: line.label })
                return (
                  <circle
                    key={point.index}
                    cx={x(point.index)}
                    cy={y(point.value)}
                    r="3.5"
                    fill="white"
                    stroke="currentColor"
                    strokeWidth="2"
                    tabIndex={0}
                    aria-label={`${line.label}, ${point.label}, ${format(point.value)}`}
                    className="hover:r-5 focus:r-5 focus:outline-focus"
                    onFocus={show}
                    onMouseEnter={show}
                    onClick={show}
                    onBlur={() => setActive(undefined)}
                    onMouseLeave={() => setActive(undefined)}
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
        {active
          ? `${active.series} · ${active.point.label} · ${format(active.point.value)}`
          : 'Hover over or focus a point for its value.'}
      </figcaption>
    </figure>
  )
}
