import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getCurrentAccount, signOut } from '../api/accounts'
import type { Account } from '../api/accounts'
import { SessionContext } from './session'
import type { Session } from './session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<Session['status']>('loading')

  const refresh = useCallback(
    (signal?: AbortSignal) =>
      getCurrentAccount(signal).then(
        (current) => {
          if (!signal?.aborted) {
            setAccount(current)
            setStatus('ready')
          }
        },
        () => {
          if (!signal?.aborted) {
            setAccount(null)
            setStatus('error')
          }
        },
      ),
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  async function logout() {
    await signOut()
    setAccount(null)
    setStatus('ready')
  }

  return (
    <SessionContext.Provider value={{ account, status, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  )
}
