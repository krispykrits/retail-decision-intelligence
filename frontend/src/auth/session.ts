import { createContext, useContext } from 'react'
import type { Account } from '../api/accounts'

export interface Session {
  account: Account | null
  status: 'loading' | 'ready' | 'error'
  refresh: (signal?: AbortSignal) => Promise<void>
  logout: () => Promise<void>
}

export const SessionContext = createContext<Session | undefined>(undefined)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('SessionProvider is required')
  return session
}
