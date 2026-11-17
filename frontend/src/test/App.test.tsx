import { render as renderView, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { SessionContext } from '../auth/session'

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
