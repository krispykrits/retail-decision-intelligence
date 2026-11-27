import { useEffect, useState } from 'react'
import { abortableRequest } from '../../api/abortableRequest'

export type ValueResult<T> = { data: T; error?: never } | { data?: never; error: true }

export function useValueRequest<T>(load?: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{
    load: typeof load
    attempt: number
    result: ValueResult<T>
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
