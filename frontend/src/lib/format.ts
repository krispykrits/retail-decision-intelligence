const numbers = new Intl.NumberFormat('en-US')
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const dates = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export const numberLabel = (value: number | string) => numbers.format(Number(value))
export const moneyLabel = (value: number | string) => money.format(Number(value))

export function dateLabel(value: string) {
  return dates.format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value))
}

export function dateAfter(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return dateLabel(date.toISOString())
}
