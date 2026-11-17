import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  registerAccount,
  requestRecovery,
  requestVerification,
  resetPassword,
  signIn,
  verifyEmail,
} from '../api/accounts'
import { useSession } from '../auth/session'

const titles = {
  login: 'Sign in',
  register: 'Create your account',
  recover: 'Reset your password',
  reset: 'Choose a new password',
  verify: 'Verify your email',
  resend: 'Resend verification',
} as const
type Mode = keyof typeof titles

export function AccountPage() {
  const { mode = 'login' } = useParams()
  if (!Object.hasOwn(titles, mode)) return <Navigate to="/account/login" replace />
  return <AccountForm key={mode} currentMode={mode as Mode} />
}

function AccountForm({ currentMode }: { currentMode: Mode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { account, refresh } = useSession()
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    // Keep recovery/verification tokens in memory, never in history or storage.
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  const requestedDestination: unknown = location.state?.from
  const destination =
    typeof requestedDestination === 'string' &&
    requestedDestination.startsWith('/') &&
    !requestedDestination.startsWith('//')
      ? requestedDestination
      : '/command-center'
  if (account && currentMode === 'login') return <Navigate to={destination} replace />
  const passwordRequired = ['login', 'register', 'reset'].includes(currentMode)
  const emailRequired = !['verify', 'reset'].includes(currentMode)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    setBusy(true)
    setMessage('')
    setError('')
    try {
      switch (currentMode) {
        case 'login': {
          await signIn(email, password)
          await refresh()
          navigate(destination, { replace: true })
          break
        }
        case 'register':
          await registerAccount({
            email,
            password,
            display_name: String(form.get('display_name') ?? ''),
          })
          setMessage(
            'Check your inbox for a verification link. If you already have an account, sign in or request verification again.',
          )
          break
        case 'recover':
          await requestRecovery(email)
          setMessage('If an account exists for this email, a recovery link has been sent.')
          break
        case 'resend':
          await requestVerification(email)
          setMessage('If this account needs verification, a new link has been sent.')
          break
        case 'verify':
          await verifyEmail(token)
          setMessage('Email verified. You can now sign in.')
          break
        case 'reset':
          await resetPassword(token, password)
          setMessage(
            'Password updated and existing sessions signed out. Sign in with your new password.',
          )
          break
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account access is unavailable. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6 font-sans text-ink">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-brand">Retail Decision Intelligence</p>
        <h1 className="mb-6 text-2xl font-bold">{titles[currentMode]}</h1>
        {error && (
          <p role="alert" className="mb-4 text-red-700">
            {error}
          </p>
        )}
        {message ? (
          <p role="status" className="mb-5">
            {message}
          </p>
        ) : (
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            {currentMode === 'register' && (
              <label className="grid gap-1.5">
                Display name
                <input
                  name="display_name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  className="rounded-lg border border-line px-3 py-2"
                />
              </label>
            )}
            {emailRequired && (
              <label className="grid gap-1.5">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="rounded-lg border border-line px-3 py-2"
                />
              </label>
            )}
            {passwordRequired && (
              <label className="grid gap-1.5">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={currentMode === 'login' ? 'current-password' : 'new-password'}
                  minLength={currentMode === 'login' ? 1 : 15}
                  maxLength={128}
                  required
                  aria-describedby={currentMode === 'login' ? undefined : 'password-help'}
                  className="rounded-lg border border-line px-3 py-2"
                />
                {currentMode !== 'login' && (
                  <span id="password-help" className="text-sm text-muted">
                    Use 15–128 characters. A passphrase works well.
                  </span>
                )}
              </label>
            )}
            {['verify', 'reset'].includes(currentMode) && !token && (
              <p>Open the link from your email to continue.</p>
            )}
            <button
              className="rounded-lg bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
              disabled={busy || (['verify', 'reset'].includes(currentMode) && !token)}
            >
              {busy ? 'Please wait…' : titles[currentMode]}
            </button>
          </form>
        )}
        <nav aria-label="Account options" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {currentMode !== 'login' && <Link to="/account/login">Sign in</Link>}
          {currentMode === 'login' && (
            <>
              <Link to="/account/register">Create account</Link>
              <Link to="/account/recover">Forgot password?</Link>
              <Link to="/account/resend">Resend verification</Link>
            </>
          )}
        </nav>
      </section>
    </main>
  )
}
