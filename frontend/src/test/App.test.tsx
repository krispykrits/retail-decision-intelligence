import { render as renderView, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { SessionContext } from '../auth/session'
import { getDatasets, getImportHistory, uploadCsv, type ImportResult } from '../api/imports'

vi.mock('../api/imports', () => ({
  getDatasets: vi.fn().mockResolvedValue([]),
  getImportHistory: vi.fn().mockResolvedValue([]),
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
  it('opens Command Center by default', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Command Center')
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeVisible()
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
