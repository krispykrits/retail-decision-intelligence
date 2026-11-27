import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { RetentionOverview } from '../../api/retention'
import { household360Path } from '../../app/workspaces'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { useHouseholdDrilldown } from '../../components/useHouseholdDrilldown'
import { dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import { segmentLabels } from '../customer-value/cohortQuery'
import { atRisk, percent } from './engagement'
import { HouseholdEngagementDetails } from './HouseholdEngagementPage'

const pageSize = 5
type Sort = 'recency' | 'frequency' | 'spend' | 'risk'

export function RetentionHouseholds({ data }: { data: RetentionOverview }) {
  const { pathname, search } = useLocation()
  const [showScores, setShowScores] = useState(false)
  const [sort, setSort] = useState<Sort>('recency')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(1)
  const hasScores = data.households.some((row) => row.churn_risk != null)
  const forecast = showScores && hasScores
  const rows = data.households.filter((row) =>
    forecast ? row.churn_risk != null : data.history_complete && atRisk(row),
  )
  const { selected, backButton, open, close } = useHouseholdDrilldown(rows)

  function changeSort(column: Sort) {
    setAscending(sort === column && !ascending)
    setSort(column)
    setPage(1)
  }

  function header(label: string, column: Sort) {
    return (
      <button
        type="button"
        className="font-semibold hover:underline"
        onClick={() => changeSort(column)}
      >
        {label} {sort === column && <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>}
      </button>
    )
  }

  const values = {
    recency: (row: (typeof rows)[number]) => row.recency_days ?? 0,
    frequency: (row: (typeof rows)[number]) => row.purchase_days_180d,
    spend: (row: (typeof rows)[number]) => Number(row.net_spend_90d),
    risk: (row: (typeof rows)[number]) => row.churn_risk ?? 0,
  }
  rows.sort(
    (first, second) =>
      (values[sort](first) - values[sort](second)) * (ascending ? 1 : -1) ||
      first.household_id.localeCompare(second.household_id),
  )
  const start = (page - 1) * pageSize
  const columns = {
    household: 'Household',
    segment: 'Segment',
    last: 'Last purchase',
    recency: header('Days since purchase', 'recency'),
    frequency: header('Purchase days · 180d', 'frequency'),
    spend: header('Net spend · 90d', 'spend'),
    ...(forecast ? { risk: header('Predicted risk', 'risk') } : {}),
  }

  return (
    <Panel aria-labelledby="retention-households">
      <PanelHeading
        id="retention-households"
        title="At-risk household details"
        icon="/customers"
        className="relative"
      >
        Review households with a long gap since their last purchase. Switch to predicted risk to see
        all households with a validated forecast.
      </PanelHeading>
      {selected && (
        <div className="mt-3" role="region" aria-labelledby="household-engagement">
          <button
            ref={backButton}
            type="button"
            className="mb-3 text-sm font-semibold text-link hover:underline"
            onClick={close}
          >
            ← Back to households
          </button>
          <HouseholdEngagementDetails
            row={selected}
            asOf={data.as_of}
            horizon={data.evidence.horizon_days}
          />
          <Link
            className="mt-4 inline-block text-sm font-semibold text-link hover:underline"
            to={`${household360Path}/${encodeURIComponent(selected.household_id)}`}
            state={{
              household: selected,
              asOf: data.as_of,
              horizon: data.evidence.horizon_days,
              returnTo: pathname + search,
            }}
          >
            Open Household 360
          </Link>
        </div>
      )}
      <div hidden={Boolean(selected)}>
        {hasScores && (
          <label className="mt-3 inline-flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={forecast}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setShowScores(checked)
                setSort(checked ? 'risk' : 'recency')
                setAscending(false)
                setPage(1)
              }}
            />
            Show households with predicted risk
          </label>
        )}
        <p className="my-3 text-xs text-muted">
          {forecast
            ? 'Predicted chance of no purchase in the next 60 days.'
            : 'Observed households with 91–180 days since their last purchase.'}
        </p>
        {rows.length ? (
          <>
            <DataTable
              columns={columns}
              sort={{ column: sort, direction: ascending ? 'ascending' : 'descending' }}
              viewportLabel="Retention household results"
            >
              {rows.slice(start, start + pageSize).map((row) => (
                <tr key={row.household_id}>
                  <th scope="row">
                    <button
                      type="button"
                      className="font-semibold text-link underline-offset-2 hover:underline"
                      onClick={(event) => open(row.household_id, event.currentTarget)}
                    >
                      {row.household_id}
                    </button>
                  </th>
                  <td>{segmentLabels[row.segment]}</td>
                  <td>{row.last_purchase ? dateLabel(row.last_purchase) : '—'}</td>
                  <td>{row.recency_days ?? '—'}</td>
                  <td>{numberLabel(row.purchase_days_180d)}</td>
                  <td>{moneyLabel(row.net_spend_90d)}</td>
                  {forecast && <td>{row.churn_risk == null ? '—' : percent(row.churn_risk)}</td>}
                </tr>
              ))}
            </DataTable>
            {rows.length > pageSize && (
              <nav
                className="mt-3 flex items-center gap-3 text-sm"
                aria-label="Retention household pages"
              >
                <button
                  className="font-semibold text-link disabled:text-muted"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  {start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length}
                </span>
                <button
                  className="font-semibold text-link disabled:text-muted"
                  disabled={start + pageSize >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            {data.history_complete
              ? 'No at-risk households match these filters.'
              : 'There is not enough history to identify at-risk households.'}
          </p>
        )}
      </div>
    </Panel>
  )
}
