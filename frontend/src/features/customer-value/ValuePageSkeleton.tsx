import { MetricSkeleton } from '../../components/MetricSkeleton'
import { Panel } from '../../components/Panel'
import { Skeleton } from '../../components/Skeleton'
import { valueAnalysisGrid } from './valueLayout'

export function ValuePageSkeleton() {
  return (
    <div role="status" className="space-y-3 md:space-y-4">
      <span className="sr-only">Loading household spending…</span>
      <Panel>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {['households', 'spend', 'average', 'outlook'].map((name) => (
            <div
              key={name}
              className="flex items-start gap-2 rounded-xl border border-line bg-canvas p-3"
            >
              <MetricSkeleton />
            </div>
          ))}
        </div>
      </Panel>
      <div className={valueAnalysisGrid}>
        <Panel className="space-y-4">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-44 w-full" />
        </Panel>
        <Panel className="space-y-4">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5" />
        </Panel>
        <Panel className="space-y-4">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </Panel>
      </div>
    </div>
  )
}
