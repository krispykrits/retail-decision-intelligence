import type { FormEvent } from 'react'
import type { Dashboard, DashboardQuery } from '../../api/dashboard'
import { periodLabel } from './format'

const fieldStyle =
  'min-w-0 rounded-lg border border-field-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus'

export function DashboardFilters({
  query,
  data,
  apply,
  reset,
}: {
  query: DashboardQuery
  data: Dashboard
  apply: (filters: DashboardQuery) => void
  reset: () => void
}) {
  const { options, summary } = data
  const selection = summary.current_period
  const { first_date: first, last_date: last } = options

  function availableDate(value: string | undefined) {
    if (value && first && value < first) return first
    if (value && last && value > last) return last
    return value ?? ''
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const start = String(form.get('start') || '')
    const end = String(form.get('end') || '')
    const region = String(form.get('region') || '')
    const department = String(form.get('department') || '')
    const endInput = event.currentTarget.elements.namedItem('end') as HTMLInputElement
    if (start && end && start > end) {
      endInput.setCustomValidity('Choose an end date on or after the start date.')
      endInput.reportValidity()
      return
    }
    apply({
      start: start || undefined,
      end: end || undefined,
      region: (region || undefined) as DashboardQuery['region'],
      department: department || undefined,
    })
  }

  return (
    <form
      aria-label="Dashboard filters"
      aria-describedby="dashboard-date-coverage"
      className="flex flex-wrap items-end gap-3"
      onSubmit={submit}
      onChange={(event) => {
        const input = event.currentTarget.elements.namedItem('end') as HTMLInputElement
        input.setCustomValidity('')
      }}
    >
      <div id="dashboard-date-coverage" className="w-full space-y-1 text-xs text-muted">
        {first && last && <p>Imported dates {periodLabel({ start: first, end: last })}</p>}
        <p>
          The default range covers up to 90 days ending on the latest imported transaction date. The
          prior period is the same number of days immediately before your selection.
        </p>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-nav">
        Start date
        <input
          className={fieldStyle}
          name="start"
          type="date"
          required
          min={first ?? undefined}
          max={last ?? undefined}
          defaultValue={availableDate(query.start ?? selection?.start)}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-nav">
        End date
        <input
          className={fieldStyle}
          name="end"
          type="date"
          required
          min={first ?? undefined}
          max={last ?? undefined}
          defaultValue={availableDate(query.end ?? selection?.end)}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-nav">
        Region
        <select name="region" className={fieldStyle} defaultValue={query.region ?? ''}>
          <option value="">All regions</option>
          {options.regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </label>
      <label className="grid max-w-full gap-1 text-xs font-semibold text-nav">
        Department
        <select name="department" className={fieldStyle} defaultValue={query.department ?? ''}>
          <option value="">All departments</option>
          {options.departments.map((department) => (
            <option key={department}>{department}</option>
          ))}
        </select>
      </label>
      <button
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-link"
        type="submit"
      >
        Apply filters
      </button>
      <button
        className="rounded-lg px-2 py-2 text-sm font-semibold text-link hover:bg-nav-hover"
        type="button"
        onClick={reset}
      >
        Reset
      </button>
    </form>
  )
}
