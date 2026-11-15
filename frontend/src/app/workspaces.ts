export const workspaces = [
  {
    path: '/command-center',
    title: 'Command Center',
    description: 'Retail performance and investigation signals.',
  },
  {
    path: '/customers',
    title: 'Customer Intelligence',
    description: 'Household behavior, value, and retention.',
  },
  {
    path: '/merchandise',
    title: 'Merchandise Intelligence',
    description: 'Category, product, and brand analysis.',
  },
  {
    path: '/baskets',
    title: 'Basket Explorer',
    description: 'Basket composition and purchase relationships.',
  },
  {
    path: '/forecast',
    title: 'Forecast Studio',
    description: 'Demand forecasts and evaluation evidence.',
  },
  {
    path: '/households',
    title: 'Household 360',
    description: 'Household search and purchase history.',
  },
  { path: '/data', title: 'Data Operations', description: 'Dataset uploads and import results.' },
] as const

export type Workspace = (typeof workspaces)[number]
