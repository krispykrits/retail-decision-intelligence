import type { FormEvent } from 'react'
import type { Cohort } from '../../api/customerValue'
import { LoadingProgress } from '../../components/LoadingProgress'

import { regions, segmentLabels } from './cohortQuery'

const ageRanges = ['19-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75+']
const householdSizes = ['1', '2', '3', '4', '5+']

const fieldClass =
  'min-w-0 rounded-lg border border-field-line bg-surface px-3 py-2 text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-focus'
const labelClass = 'grid gap-1 text-xs font-semibold text-nav'

export function ValueFilters({
  cohort,
  updating,
  apply,
}: {
  cohort: Cohort
  updating: boolean
  apply: (params: URLSearchParams) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
    }
    apply(params)
  }

  return (
    <form
      aria-label="Customer value cohort filters"
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3"
    >
      <label className={labelClass}>
        Store region
        <select name="region" className={fieldClass} defaultValue={cohort.region ?? ''}>
          <option value="">All regions</option>
          {regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Customer segment
        <select name="segment" className={fieldClass} defaultValue={cohort.segment ?? ''}>
          <option value="">All segments</option>
          {Object.entries(segmentLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <details
        open={cohort.age_range || cohort.household_size ? true : undefined}
        className="relative"
      >
        <summary className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-link">
          More filters
        </summary>
        <div className="mt-2 grid gap-2 rounded-lg border border-line bg-surface p-3 shadow-panel sm:absolute sm:z-10">
          <label className={labelClass}>
            Age range
            <input
              className={`${fieldClass} w-32`}
              name="age_range"
              defaultValue={cohort.age_range ?? ''}
              list="clv-age-ranges"
              maxLength={80}
              placeholder="All age ranges"
            />
            <datalist id="clv-age-ranges">
              {ageRanges.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label className={labelClass}>
            Household size
            <input
              className={`${fieldClass} w-31`}
              name="household_size"
              defaultValue={cohort.household_size ?? ''}
              list="clv-household-sizes"
              maxLength={80}
              placeholder="All sizes"
            />
            <datalist id="clv-household-sizes">
              {householdSizes.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
        </div>
      </details>
      <button
        type="submit"
        className="relative rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-link"
      >
        {updating ? 'Applying filters…' : 'Apply filters'}
        {updating && <LoadingProgress className="bg-white/35 [&>span]:bg-white" />}
      </button>
      <button
        type="reset"
        onClick={() => apply(new URLSearchParams())}
        className="rounded-lg px-2 py-2 text-sm font-semibold text-link hover:bg-nav-hover"
      >
        Reset
      </button>
    </form>
  )
}
