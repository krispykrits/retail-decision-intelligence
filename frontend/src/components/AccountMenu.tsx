import { useState } from 'react'
import { useSession } from '../auth/session'
import { Spinner } from './Spinner'

export function AccountMenu() {
  const { account, logout } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleLogout() {
    setBusy(true)
    setError('')
    try {
      await logout()
    } catch {
      setError('Sign-out failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-40 max-md:h-13 max-md:justify-end max-md:border-b max-md:border-line max-md:bg-surface max-md:px-3 md:flex-wrap md:gap-3">
      <span className="min-w-0 truncate text-muted" title={account?.display_name}>
        {account?.display_name}
        <span className="hidden md:inline"> · {account?.roles.join(', ')}</span>
      </span>
      <button
        type="button"
        className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand enabled:hover:border-brand enabled:hover:bg-canvas enabled:hover:text-brand enabled:active:bg-line disabled:cursor-wait disabled:bg-canvas disabled:text-muted md:min-w-28"
        disabled={busy}
        onClick={() => void handleLogout()}
      >
        {busy && <Spinner />}
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      <span className="sr-only" aria-live="polite">
        {busy ? 'Signing out…' : ''}
      </span>
      {error && (
        <span
          className="text-error max-md:absolute max-md:top-full max-md:right-3 max-md:rounded-md max-md:bg-surface max-md:p-2"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
}
