import { render as renderView, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { TrendChart } from '../components/TrendChart'
import { SessionContext } from '../auth/session'
import { getDashboard, getDashboardTrend, type Dashboard } from '../api/dashboard'
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

vi.mock('../api/dashboard', () => ({ getDashboard: vi.fn(), getDashboardTrend: vi.fn() }))
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
  it('highlights the matching trend buckets and keeps their difference after clicking', async () => {
    const user = userEvent.setup()
    render(
      <TrendChart
        label="Spend comparison"
        series={[
          {
            id: 'prior',
            label: 'Prior period',
            points: [{ index: 2, value: 40, label: 'Jul 13–19' }],
          },
          {
            id: 'current',
            label: 'Selected period',
            points: [
              { index: 2, value: 45, label: 'Aug 3–9' },
              { index: 3, value: 20, label: 'Aug 10–16' },
            ],
          },
        ]}
        ticks={[]}
        format={(value) => `$${value.toFixed(2)}`}
      />,
    )

    expect(screen.getByText('$10.00')).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()

    const prior = screen.getByRole('button', { name: /Prior period, Jul 13–19/ })
    const current = screen.getByRole('button', { name: /Selected period, Aug 3–9/ })
    await user.click(current)
    await user.unhover(current)
    expect(prior).toHaveAttribute('aria-pressed', 'true')
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('+$5.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Selected period, Aug 10–16/ }))
    expect(prior).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('+$5.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
  })

  it('explains out-of-range selections and suppresses their prior comparison', async () => {
    const user = userEvent.setup()
    const current = { start: '2020-06-22', end: '2020-11-25', partial: true }
    const prior = { start: '2020-01-18', end: '2020-06-21', partial: false }
    const totals = {
      lines: 4,
      spend: '20.00',
      households: 2,
      baskets: 3,
      units: 2,
      avg_basket: '6.67',
    }
    const dashboard = vi.mocked(getDashboard)
    dashboard.mockResolvedValueOnce({
      ...emptyDashboard,
      options: { first_date: '2018-08-17', last_date: '2020-08-15', regions: [], departments: [] },
      summary: {
        ...emptyDashboard.summary,
        current: totals,
        current_period: current,
        prior_period: prior,
      },
      trend: {
        ...emptyDashboard.trend,
        grain: 'week',
        current_period: current,
        prior_period: prior,
        current: [{ start: '2020-08-10', end: '2020-08-16', index: 7, value: '20.00' }],
        prior: [{ start: '2020-06-13', end: '2020-06-19', index: 21, value: '10.00' }],
      },
    })
    render(
      <MemoryRouter initialEntries={['/command-center?start=2020-06-22&end=2020-11-25']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/This selection extends beyond the imported dates/),
    ).toBeVisible()
    expect(screen.queryByText('Prior period', { exact: true })).not.toBeInTheDocument()
    expect(
      screen.getByLabelText(/Selected period, Aug 10, 2020 – Aug 15, 2020 \(6 days\)/),
    ).toBeInTheDocument()
    await user.click(screen.getByText('Analysis period'))
    expect(screen.getByLabelText('End date')).toHaveAttribute('max', '2020-08-15')
    expect(screen.getByLabelText('End date')).toHaveValue('2020-08-15')
  })

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
    let finishDepartment = () => {}
    let finishTrend = () => {}
    const departmentLoaded = new Promise<void>((resolve) => {
      finishDepartment = resolve
    })
    const trendLoaded = new Promise<void>((resolve) => {
      finishTrend = resolve
    })
    const point = { index: 0, start: current.start, end: current.start, value: '2' }
    const getTrend = vi.mocked(getDashboardTrend)
    getTrend.mockImplementation(async ({ metric = 'spend' }) => {
      await trendLoaded
      return { ...emptyDashboard.trend, metric, current: [point] }
    })
    dashboard.mockImplementation(async ({ metric = 'spend', department }) => {
      if (department) await departmentLoaded
      return {
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
          current: [point],
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
      }
    })
    try {
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>,
      )
      expect(await screen.findByRole('heading', { name: 'Department contribution' })).toBeVisible()
      expect(screen.getByText('Net spend rose in FOOD.')).toBeVisible()
      await user.click(screen.getByText('Analysis period'))
      await user.selectOptions(screen.getByLabelText('Region'), 'EAST')
      await user.click(screen.getByRole('button', { name: 'Apply filters' }))
      expect(dashboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ region: 'EAST', start: current.start, end: current.end }),
        expect.any(AbortSignal),
      )
      const selector = await screen.findByLabelText('Trend metric')
      const contribution = screen.getByRole('heading', { name: 'Department contribution' })
      const dashboardRequests = dashboard.mock.calls.length
      await user.selectOptions(selector, 'units')
      expect(screen.getByText('Updating trend…')).toBeVisible()
      expect(contribution).toBeVisible()
      expect(selector).toHaveFocus()
      expect(dashboard).toHaveBeenCalledTimes(dashboardRequests)
      expect(getTrend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          region: 'EAST',
          start: current.start,
          end: current.end,
          metric: 'units',
        }),
        expect.any(AbortSignal),
      )
      finishTrend()
      expect(await screen.findByRole('group', { name: 'Net units by day' })).toBeVisible()

      await user.click(screen.getByRole('link', { name: /^FOOD$/ }))
      expect(screen.getByText('Updating retail performance…')).toBeVisible()
      expect(contribution).toBeVisible()
      finishDepartment()
      expect(await screen.findByRole('heading', { name: 'Commodity contribution' })).toBeVisible()
      expect(screen.getByText('PRODUCE')).toBeVisible()
      expect(screen.getByLabelText('Trend metric')).toHaveValue('units')
      expect(dashboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ region: 'EAST', department: 'FOOD' }),
        expect.any(AbortSignal),
      )
      expect(screen.getByRole('link', { name: 'View trend for FOOD' })).toHaveAttribute(
        'href',
        expect.stringContaining('department=FOOD'),
      )

      await user.click(screen.getByRole('link', { name: 'Back to departments' }))
      expect(await screen.findByRole('heading', { name: 'Department contribution' })).toBeVisible()
      expect(screen.getByLabelText('Trend metric')).toHaveValue('units')
      expect(dashboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ region: 'EAST', department: undefined }),
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
