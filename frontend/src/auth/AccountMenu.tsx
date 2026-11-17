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
        className="rounded-lg border border-line px-3 py-2"
        disabled={busy}
        onClick={() => void handleLogout()}
      >
        Sign out
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  )
}
