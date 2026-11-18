import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '../components/Skeleton'
import { useSession } from './session'

export function RequireAccount() {
  const { account, status, refresh } = useSession()
  const location = useLocation()
  if (status === 'loading')
    return (
      <div role="status" className="min-h-screen space-y-4 bg-canvas p-4 md:p-8">
        <span className="sr-only">Checking your session…</span>
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
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
