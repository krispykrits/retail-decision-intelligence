export const commandCenterPath = '/command-center'
export const customerIntelligencePath = '/customers'
export const dataOperationsPath = '/data'

export const workspaces = [
  {
    path: commandCenterPath,
    title: 'Command Center',
    description:
      'Compare retail performance across periods and investigate changes in spend, sales volume, and household shopping activity.',
  },
  {
    path: customerIntelligencePath,
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
  {
    path: dataOperationsPath,
    title: 'Data Operations',
    description: 'Dataset uploads and import results.',
  },
] as const

export type Workspace = (typeof workspaces)[number]
