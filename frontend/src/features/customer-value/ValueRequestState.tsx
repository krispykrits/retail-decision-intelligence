import { Skeleton } from '../../components/Skeleton'

export function ValueLoading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}…</p>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}

export function ValueError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <p role="alert" className="text-sm text-error">
        {message}
      </p>
      <button
        type="button"
        onClick={retry}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
      >
        Retry
      </button>
    </div>
  )
}
