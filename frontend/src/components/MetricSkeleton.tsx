import { Skeleton } from './Skeleton'

export function MetricSkeleton() {
  return (
    <>
      <Skeleton className="size-10 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-24 max-w-full" />
        <Skeleton className="h-6 w-28 max-w-full" />
        <Skeleton className="h-3 w-20 max-w-full" />
      </div>
    </>
  )
}
