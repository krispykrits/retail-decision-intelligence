export function abortableRequest<T>(
  load: (signal: AbortSignal) => Promise<T>,
  onSuccess: (data: T) => void,
  onError: () => void,
) {
  const controller = new AbortController()
  void load(controller.signal).then(
    (data) => {
      if (!controller.signal.aborted) onSuccess(data)
    },
    () => {
      if (!controller.signal.aborted) onError()
    },
  )
  return () => controller.abort()
}
