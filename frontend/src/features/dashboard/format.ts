import type { Metric, Period } from '../../api/dashboard'

export const metrics = {
  spend: 'Net spend',
  households: 'Active households',
  baskets: 'Baskets',
  units: 'Net units',
  avg_basket: 'Average basket value',
} satisfies Record<Metric, string>

export function isMetric(value: string | null): value is Metric {
  return value !== null && Object.hasOwn(metrics, value)
}

const number = new Intl.NumberFormat('en-US')
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const dates = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export function valueLabel(metric: Metric, value: number | string) {
  return (metric === 'spend' || metric === 'avg_basket' ? money : number).format(Number(value))
}

export function percentLabel(value: number | string) {
  return `${percent.format(Number(value))}%`
}

export function dateLabel(value: string) {
  return dates.format(new Date(`${value}T00:00:00Z`))
}

export function periodLabel(period: Pick<Period, 'start' | 'end'>) {
  return period.start === period.end
    ? dateLabel(period.start)
    : `${dateLabel(period.start)} – ${dateLabel(period.end)}`
}
