import { render as renderView, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { SessionContext } from '../auth/session'
import { getDashboard, type Dashboard } from '../api/dashboard'
import { getDatasets, getImportHistory, uploadCsv, type ImportResult } from '../api/imports'

const emptyDashboard: Dashboard = {
  options: { first_date: null, last_date: null, regions: [], departments: [] },
  summary: {
    current: null,
    prior: null,
    current_period: null,
    prior_period: null,
    changes: {},
    cohorts: null,
    inactivity: null,
    sparkline: [],
    source_version: 0,
  },
  trend: {
    metric: 'spend',
    grain: 'day',
    current_period: null,
    prior_period: null,
    current: [],
    prior: [],
  },
  breakdown: { dimension: 'department', current_period: null, prior_period: null, rows: [] },
  signals: { items: [] },
}

vi.mock('../api/dashboard', () => ({ getDashboard: vi.fn() }))
vi.mocked(getDashboard).mockResolvedValue(emptyDashboard)

vi.mock('../api/imports', () => ({
  getDatasets: vi.fn().mockResolvedValue([]),
  getImportHistory: vi.fn().mockResolvedValue([]),
  pendingImportId: vi.fn().mockReturnValue(null),
  resumeImport: vi.fn(),
  uploadCsv: vi.fn(),
}))

function render(view: ReactNode, administrator = false) {
  return renderView(
    <SessionContext.Provider
      value={{
        account: {
          id: 'test-account',
          email: 'analyst@example.com',
          display_name: 'Retail analyst',
          roles: [administrator ? 'Administrator' : 'Analyst'],
        },
        status: 'ready',
        refresh: vi.fn(),
        logout: vi.fn(),
      }}
    >
      {view}
    </SessionContext.Provider>,
  )
}

const expectedRoutes = [
  ['/command-center', 'Command Center'],
  ['/customers', 'Customer Intelligence'],
  ['/merchandise', 'Merchandise Intelligence'],
  ['/baskets', 'Basket Explorer'],
  ['/forecast', 'Forecast Studio'],
  ['/households', 'Household 360'],
  ['/data', 'Data Operations'],
] as const

describe('workspace shell', () => {
  it('opens Command Center by default', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Command Center')
    expect(
      await screen.findByRole('heading', { name: 'No transactions imported yet' }),
    ).toBeVisible()
  })

  it.each(expectedRoutes)('supports the %s deep link', (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title)
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates between workspaces', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('link', { name: 'Data Operations' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Data Operations')
  })

  it('handles an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})

describe('Command Center', () => {
  it('filters retail results, switches the trend metric, and opens evidence', async () => {
    const user = userEvent.setup()
    const current = { start: '2020-07-01', end: '2020-07-07', partial: false }
    const prior = { start: '2020-06-24', end: '2020-06-30', partial: false }
    const totals = {
      lines: 4,
      spend: '20.00',
      households: 2,
      baskets: 3,
      units: 2,
      avg_basket: '6.67',
    }
    const delta = { amount: '12.00', percent: '150.0' }
    const dashboard = vi.mocked(getDashboard)
    dashboard.mockClear()
    dashboard.mockImplementation(async ({ metric = 'spend', department }) => ({
      ...emptyDashboard,
      options: {
        first_date: prior.start,
        last_date: current.end,
        regions: ['EAST', 'CENTRAL'],
        departments: ['FOOD'],
      },
      summary: {
        ...emptyDashboard.summary,
        current: totals,
        current_period: current,
        prior_period: prior,
        changes: { spend: delta },
        source_version: 1,
      },
      trend: {
        ...emptyDashboard.trend,
        metric,
        current: [{ index: 0, start: current.start, end: current.start, value: '2' }],
      },
      breakdown: {
        ...emptyDashboard.breakdown,
        dimension: department ? 'commodity' : 'department',
        rows: [
          {
            name: department ? 'PRODUCE' : 'FOOD',
            current: totals,
            prior: null,
            change: null,
            share: '100',
          },
        ],
      },
      signals: {
        items: [
          {
            severity: 'info',
            type: 'growth',
            reason: 'Net spend rose in FOOD.',
            metric: 'spend',
            delta,
            comparison: prior,
            route: '/command-center',
            route_filters: {
              start: current.start,
              end: current.end,
              region: 'EAST',
              department: 'FOOD',
              metric: 'spend',
            },
            evidence: {
              name: 'FOOD',
              current: '20.00',
              prior: '8.00',
              current_lines: 4,
              prior_lines: 3,
            },
            source_version: 1,
          },
        ],
      },
    }))
    try {
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>,
      )
      expect(await screen.findByRole('heading', { name: 'Department contribution' })).toBeVisible()
      expect(screen.getByText('Net spend rose in FOOD.')).toBeVisible()
      await user.selectOptions(screen.getByLabelText('Region'), 'EAST')
      await user.click(screen.getByRole('button', { name: 'Apply filters' }))
      expect(dashboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ region: 'EAST', start: current.start, end: current.end }),
        expect.any(AbortSignal),
      )
      await user.selectOptions(await screen.findByLabelText('Trend metric'), 'units')
      expect(await screen.findByRole('group', { name: 'Net units by day' })).toBeVisible()
      await user.click(screen.getByRole('link', { name: 'View trend for FOOD' }))
      expect(await screen.findByRole('heading', { name: 'Commodity contribution' })).toBeVisible()
      expect(screen.getByText('PRODUCE')).toBeVisible()
      expect(dashboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ region: 'EAST', department: 'FOOD', metric: 'spend' }),
        expect.any(AbortSignal),
      )
    } finally {
      dashboard.mockResolvedValue(emptyDashboard)
    }
  })
})

describe('data operations', () => {
  it('shows the inventory to an analyst without upload or history controls', async () => {
    render(
      <MemoryRouter initialEntries={['/data']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText('No records have been imported yet.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Import files' })).not.toBeInTheDocument()
    expect(screen.queryByText('Import history')).not.toBeInTheDocument()
  })

  it('imports dependencies first and keeps a file with errors available for retry', async () => {
    const user = userEvent.setup()
    const upload = vi.mocked(uploadCsv)
    const inventory = vi.mocked(getDatasets)
    inventory.mockClear()
    upload.mockImplementation(
      async (dataset, file) =>
        ({
          import_id: dataset,
          dataset,
          filename: file.name,
          status: dataset === 'transactions' ? 'completed_with_errors' : 'completed',
          finished_at: '2026-11-17T21:00:00Z',
          processed: 1,
          inserted: dataset === 'transactions' ? 0 : 1,
          duplicates_skipped: 0,
          conflicts: 0,
          rejected: dataset === 'transactions' ? 1 : 0,
          errors:
            dataset === 'transactions'
              ? [{ row_number: 2, reason: 'Product ID is missing from stored products.' }]
              : [],
        }) satisfies ImportResult,
    )
    render(
      <MemoryRouter initialEntries={['/data']}>
        <App />
      </MemoryRouter>,
      true,
    )
    await user.upload(
      screen.getByLabelText('Choose Transactions CSV'),
      new File(['line'], 'lines.csv'),
    )
    await user.upload(
      screen.getByLabelText('Choose Products CSV'),
      new File(['item'], 'products.csv'),
    )
    await user.upload(
      screen.getByLabelText('Choose Households CSV'),
      new File(['household'], 'households.csv'),
    )
    await user.click(screen.getByRole('button', { name: 'Import files' }))

    expect(await screen.findByText('Completed with errors')).toBeVisible()
    expect(upload.mock.calls.map(([dataset]) => dataset)).toEqual([
      'households',
      'products',
      'transactions',
    ])
    expect(inventory).toHaveBeenCalledTimes(2)
    await user.click(screen.getByText('Row errors'))
    expect(screen.getByText('Row 2 · Product ID is missing from stored products.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Import files' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Remove Transactions file' }))
    expect(screen.getByRole('button', { name: 'Import files' })).toBeDisabled()
    expect(getImportHistory).not.toHaveBeenCalled()
    await user.click(screen.getByText('Import history'))
    expect(await screen.findByText('No imports yet.')).toBeVisible()
  })
})
