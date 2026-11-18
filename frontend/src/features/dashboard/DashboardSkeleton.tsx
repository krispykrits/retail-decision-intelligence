import { Panel } from '../../components/Panel'
import { Skeleton } from '../../components/Skeleton'

export function DashboardSkeleton() {
  return (
    <div role="status" className="grid gap-3 md:gap-4">
      <span className="sr-only">Loading retail performance…</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {['spend', 'baskets', 'households', 'average'].map((metric) => (
          <Panel key={metric} className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24 max-w-full" />
              <Skeleton className="h-6 w-28 max-w-full" />
              <Skeleton className="h-3 w-20 max-w-full" />
            </div>
          </Panel>
        ))}
      </div>
      <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
        <Panel className="space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-56 w-full" />
        </Panel>
        <Panel className="space-y-4">
          <Skeleton className="h-4 w-44" />
          <div className="flex items-center gap-4">
            <Skeleton className="aspect-square w-1/3 rounded-full!" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
