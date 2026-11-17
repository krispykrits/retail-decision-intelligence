import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from './session'

export function RequireAccount() {
  const { account, status, refresh } = useSession()
  const location = useLocation()
  if (status === 'loading')
    return (
      <p role="status" className="p-8">
        Checking your session…
      </p>
    )
  if (status === 'error')
    return (
      <div className="p-8">
        <p role="alert">Account access is unavailable. Try again.</p>
        <button
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-white"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    )
  if (!account) return <Navigate to="/account/login" state={{ from: location.pathname }} replace />
  return <Outlet />
}
