import type { Dataset } from '../../api/imports'

export const datasets = [
  ['households', 'Households'],
  ['products', 'Products'],
  ['transactions', 'Transactions'],
] as const satisfies readonly (readonly [Dataset, string])[]

export const control =
  'rounded-lg border border-field-line px-3 py-1.5 text-sm font-medium text-link hover:border-brand/40 hover:bg-canvas'
export const tableStyle = 'text-xs [&_:is(th,td)]:px-2.5 [&_:is(th,td)]:py-2'
export const focus =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus'
export const button = `${control} ${focus} disabled:cursor-not-allowed disabled:opacity-50`
