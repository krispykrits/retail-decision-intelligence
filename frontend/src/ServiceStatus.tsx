import { useEffect, useState } from 'react'
import { getHealth } from './api/client'

type Status = 'checking' | 'connected' | 'unavailable'

export function ServiceStatus() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then(() => setStatus('connected'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unavailable')
      })
    return () => controller.abort()
  }, [])

  const labels: Record<Status, string> = {
    checking: 'Checking service status…',
    connected: 'Service connected',
    unavailable: 'Service status unavailable',
  }

  return <p className={`m-0 text-sm ${status === 'connected' ? 'text-success' : 'text-muted'}`} role="status">{labels[status]}</p>
}
