import { useState } from 'react'
import { useSession } from './session'

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
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>
        {account?.display_name} · {account?.roles.join(', ')}
      </span>
      <button
        type="button"
        className="min-w-28 cursor-pointer rounded-lg border border-line px-3 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand enabled:hover:border-brand enabled:hover:bg-canvas enabled:hover:text-brand enabled:active:bg-line disabled:cursor-wait disabled:bg-canvas disabled:text-muted"
        disabled={busy}
        onClick={() => void handleLogout()}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      <span className="sr-only" aria-live="polite">
        {busy ? 'Signing out…' : ''}
      </span>
      {error && <span role="alert">{error}</span>}
    </div>
  )
}
