import type { RetentionOverview } from '../../api/retention'
import { Panel, PanelHeading } from '../../components/Panel'
import { TrendChart } from '../../components/TrendChart'
import { dateLabel, numberLabel } from '../../lib/format'
import { segmentLabels } from '../customer-value/cohortQuery'
import { engagementGroups, percent } from './engagement'

export function EngagementTrend({ trend }: { trend: RetentionOverview['trend'] }) {
  const series = engagementGroups.map(({ key, label, color }) => ({
    id: key,
    label,
    color,
    points: trend.map((point, index) => ({
      index,
      label: dateLabel(point.date),
      value: point[key],
    })),
  }))
  return (
    <Panel aria-labelledby="engagement-trend">
      <PanelHeading
        id="engagement-trend"
        title="Household engagement trend"
        icon="/forecast"
        className="relative"
      >
        See how many households were active, at risk or inactive at each date, based on their most
        recent purchase at the time.
      </PanelHeading>
      {trend.length ? (
        <TrendChart
          label="Observed household activity by date"
          series={series}
          ticks={trend.map(({ date }, index) => ({ index, label: dateLabel(date) }))}
          format={numberLabel}
        />
      ) : (
        <p className="mt-3 text-sm text-muted">
          At least 180 days of transaction history are needed.
        </p>
      )}
    </Panel>
  )
}

export function EngagementSegments({ segments }: { segments: RetentionOverview['segments'] }) {
  return (
    <Panel aria-labelledby="engagement-segments">
      <PanelHeading
        id="engagement-segments"
        title="Engagement by customer segment"
        icon="/customers"
        className="relative"
      >
        Groups use shopping days and spending in the earlier half of the 180-day history. The bars
        show each group’s observed activity.
      </PanelHeading>
      {segments.length ? (
        <ul className="mt-4 space-y-4">
          {segments.map((segment) => {
            const total = engagementGroups.reduce((sum, { key }) => sum + segment[key], 0)
            return (
              <li key={segment.segment}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="font-medium">{segmentLabels[segment.segment]}</span>
                  <span className="text-xs text-muted">{numberLabel(total)} with purchases</span>
                </div>
                {total > 0 && (
                  <svg
                    className="h-2.5 w-full overflow-hidden rounded-full"
                    viewBox={`0 0 ${total} 1`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {engagementGroups.map(({ key, fill }, index) => (
                      <rect
                        key={key}
                        className={fill}
                        x={engagementGroups
                          .slice(0, index)
                          .reduce((sum, group) => sum + segment[group.key], 0)}
                        width={segment[key]}
                        height={1}
                      />
                    ))}
                  </svg>
                )}
                <p className="mt-1 text-xs text-muted">
                  {total
                    ? engagementGroups
                        .map(({ key, label }) => `${label} ${percent(segment[key] / total)}`)
                        .join(' · ')
                    : 'No purchase history in this segment'}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Segment activity is unavailable for this selection.
        </p>
      )}
    </Panel>
  )
}
