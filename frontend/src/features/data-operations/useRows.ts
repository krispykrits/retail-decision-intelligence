import { useCallback, useEffect, useState } from 'react'
import { abortableRequest } from '../../api/abortableRequest'

export function useRows<T>(load: (signal: AbortSignal) => Promise<T[]>, enabled = true) {
  const [rows, setRows] = useState<T[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    return abortableRequest(
      load,
      (data) => {
        setRows(data)
        setStatus('ready')
      },
      () => setStatus('error'),
    )
  }, [enabled, load, refreshCount])

  const refresh = useCallback(() => {
    setStatus('loading')
    setRefreshCount((count) => count + 1)
  }, [])

  return { rows, status, refresh }
}
