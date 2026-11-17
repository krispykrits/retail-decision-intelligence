import { render as renderView, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { getHealth } from '../api/client'
import { SessionContext } from '../auth/session'

vi.mock('../api/client', () => ({ getHealth: vi.fn() }))

function render(view: ReactNode) {
  return renderView(
    <SessionContext.Provider
      value={{
        account: {
          id: 'test-account',
          email: 'analyst@example.com',
          display_name: 'Retail analyst',
          roles: ['Analyst'],
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

beforeEach(() => {
  vi.mocked(getHealth).mockResolvedValue({
    status: 'ok',
    service: 'retail-decision-intelligence',
    version: '0.1.0',
  })
})

describe('workspace shell', () => {
  it('opens Command Center by default and connects to the health API', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Command Center')
    expect(await screen.findByRole('status')).toHaveTextContent('Service connected')
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeVisible()
  })

  it.each(expectedRoutes)('supports the %s deep link', async (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title)
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('aria-current', 'page')
    await screen.findByText('Service connected')
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

  it('shows service failure without claiming a connection', async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Service status unavailable')).toBeVisible()
  })

  it('handles an unknown route', async () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await screen.findByText('Service connected')
  })
})
