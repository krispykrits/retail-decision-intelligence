import { expect, it, vi } from 'vitest'
import { abortableRequest } from '../api/abortableRequest'

it('ignores a superseded response even when the loader resolves after cancellation', async () => {
  let finishFirst!: (value: string) => void
  const first = new Promise<string>((resolve) => {
    finishFirst = resolve
  })
  const second = Promise.resolve('current values')
  const onSuccess = vi.fn()
  const onError = vi.fn()
  const loadFirst = vi.fn<(signal: AbortSignal) => Promise<string>>(() => first)
  const cancelFirst = abortableRequest(loadFirst, onSuccess, onError)

  cancelFirst()
  abortableRequest(() => second, onSuccess, onError)
  finishFirst('stale values')
  await Promise.all([first, second])

  expect(loadFirst.mock.calls[0]?.[0].aborted).toBe(true)
  expect(onSuccess.mock.calls).toEqual([['current values']])
  expect(onError).not.toHaveBeenCalled()
})
