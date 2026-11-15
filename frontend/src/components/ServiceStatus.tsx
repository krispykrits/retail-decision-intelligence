import { useEffect, useState } from 'react'
import { getHealth } from '../api/client'

type Status = 'checking' | 'connected' | 'unavailable'

const statusLabels: Record<Status, string> = {
  checking: 'Checking service status…',
  connected: 'Service connected',
  unavailable: 'Service status unavailable',
}

export function ServiceStatus() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setStatus('connected')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unavailable')
      })
    return () => controller.abort()
  }, [])

  return (
    <p
      className={`m-0 text-sm ${status === 'connected' ? 'text-success' : 'text-muted'}`}
      role="status"
    >
      {statusLabels[status]}
    </p>
  )
}
