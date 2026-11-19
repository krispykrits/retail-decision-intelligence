import type { Metric, Period } from '../../api/dashboard'
import { dateLabel, moneyLabel, numberLabel } from '../../lib/format'

export { dateLabel }

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

const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export function valueLabel(metric: Metric, value: number | string) {
  return metric === 'spend' || metric === 'avg_basket' ? moneyLabel(value) : numberLabel(value)
}

export function percentLabel(value: number | string) {
  return `${percent.format(Number(value))}%`
}

export function periodLabel(period: Pick<Period, 'start' | 'end'>) {
  return period.start === period.end
    ? dateLabel(period.start)
    : `${dateLabel(period.start)} – ${dateLabel(period.end)}`
}
