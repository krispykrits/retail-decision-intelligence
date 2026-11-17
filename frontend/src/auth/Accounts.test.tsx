import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api/accounts'
import { AccountPage } from '../pages/AccountPage'
import { RequireAccount } from './RequireAccount'
import { SessionProvider } from './SessionProvider'

vi.mock('../api/accounts', () => ({
  getCurrentAccount: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  registerAccount: vi.fn(),
  requestRecovery: vi.fn(),
  requestVerification: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
  vi.mocked(api.getCurrentAccount).mockResolvedValue(null)
})

function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/account/:mode" element={<AccountPage />} />
          <Route element={<RequireAccount />}>
            <Route path="/data" element={<h1>Data Operations</h1>} />
          </Route>
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

it('requires sign-in for a deep link and returns there after authentication', async () => {
  const user = userEvent.setup()
  open('/data')
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
  await user.type(screen.getByLabelText('Email'), 'analyst@example.com')
  await user.type(screen.getByLabelText('Password'), 'A long test passphrase')
  vi.mocked(api.getCurrentAccount).mockResolvedValue({
    id: 'account',
    email: 'analyst@example.com',
    display_name: 'Analyst',
    roles: ['Analyst'],
  })
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('heading', { name: 'Data Operations' })).toBeVisible()
  expect(api.signIn).toHaveBeenCalledWith('analyst@example.com', 'A long test passphrase')
})

it('waits for explicit verification and clears the token from browser history', async () => {
  const user = userEvent.setup()
  window.history.replaceState(null, '', '/account/verify#token=test-link')
  open('/account/verify')
  expect(api.verifyEmail).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('')
  await user.click(screen.getByRole('button', { name: 'Verify your email' }))
  expect(api.verifyEmail).toHaveBeenCalledWith('test-link')
  expect(await screen.findByRole('status')).toHaveTextContent('Email verified')
  await user.click(screen.getByRole('link', { name: 'Sign in' }))
  expect(screen.getByLabelText('Password')).toBeVisible()
})

it('shows unavailable email delivery without claiming success', async () => {
  const user = userEvent.setup()
  vi.mocked(api.requestRecovery).mockRejectedValue(
    new Error('Account email delivery is not configured'),
  )
  open('/account/recover')
  await user.type(screen.getByLabelText('Email'), 'analyst@example.com')
  await user.click(screen.getByRole('button', { name: 'Reset your password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Account email delivery is not configured',
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
