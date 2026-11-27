import { useEffect, useState } from 'react'
import { abortableRequest } from './abortableRequest'

export type RequestResult<T> = { data: T; error?: never } | { data?: never; error: true }

export function useRequest<T>(load?: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{
    load: typeof load
    attempt: number
    result: RequestResult<T>
  }>()

  useEffect(
    () =>
      load &&
      abortableRequest(
        load,
        (data) => setSettled({ load, attempt, result: { data } }),
        () => setSettled({ load, attempt, result: { error: true } }),
      ),
    [load, attempt],
  )

  return {
    previousData: settled?.result.data,
    result:
      settled && settled.load === load && settled.attempt === attempt ? settled.result : undefined,
    retry: () => setAttempt((previous) => previous + 1),
  }
}
