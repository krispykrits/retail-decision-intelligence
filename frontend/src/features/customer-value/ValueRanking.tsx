import { Link, useLocation } from 'react-router-dom'
import type { ModelEvidence, PredictionPage } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { dateLabel, moneyLabel, numberLabel } from '../../lib/format'
import type { ValueResult } from './useValueRequest'
import { forecastLabel, isAvailable } from './valueDisplay'
import { ValueError, ValueLoading } from './ValueRequestState'

export function ValueRanking({
  result,
  page,
  evidence,
  selectPage,
  retry,
}: {
  result?: ValueResult<PredictionPage>
  page: number
  evidence: ModelEvidence
  selectPage: (page: number) => void
  retry: () => void
}) {
  const { search } = useLocation()
  const data = result?.data
  const available = isAvailable(evidence)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const columns = {
    id: 'Household',
    region: 'Region',
    last: 'Last purchase',
    historical: `Observed · ${evidence.history_days} days`,
    forecast: `Forecast · next ${evidence.horizon_days} days`,
  }

  return (
    <Panel aria-labelledby="clv-households">
      <PanelHeading id="clv-households" title="Household value detail" icon="/customers" />
      <p className="mt-2 mb-4 text-sm text-muted">
        {available
          ? 'Ranked by predicted net spend.'
          : 'Showing recorded spending from the published snapshot when available.'}
      </p>
      {!result && <ValueLoading label="Loading households" />}
      {result?.error && <ValueError message="Could not load households." retry={retry} />}
      {data &&
        (data.items.length === 0 && page === 1 ? (
          <p className="text-sm text-muted">No household records match this cohort.</p>
        ) : (
          <>
            <DataTable
              columns={columns}
              sort={available ? { column: 'forecast', direction: 'descending' } : undefined}
              viewportLabel="Household value results"
            >
              {data.items.map((row) => (
                <tr key={row.household_id}>
                  <th scope="row">
                    <Link
                      className="font-semibold underline-offset-2 hover:underline"
                      to={{
                        pathname: `${customerIntelligencePath}/households/${row.household_id}`,
                        search,
                      }}
                    >
                      {row.household_id}
                    </Link>
                  </th>
                  <td>{row.region ?? '—'}</td>
                  <td>{dateLabel(row.last_purchase)}</td>
                  <td>{moneyLabel(row.observed_spend_180d)}</td>
                  <td className="font-medium">{forecastLabel(row, evidence)}</td>
                </tr>
              ))}
            </DataTable>
            {(totalPages > 1 || page > 1) && (
              <nav
                className="mt-4 flex flex-wrap items-center gap-3 text-sm"
                aria-label="Household pages"
              >
                <button
                  type="button"
                  className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-45"
                  disabled={page <= 1}
                  onClick={() => selectPage(page - 1)}
                >
                  Previous
                </button>
                <span className="text-muted">
                  Page {numberLabel(data.page)} · {numberLabel(data.total)} households
                </span>
                {page > totalPages ? (
                  <button type="button" className="text-link" onClick={() => selectPage(1)}>
                    Go to first page
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-45"
                    disabled={page >= totalPages}
                    onClick={() => selectPage(page + 1)}
                  >
                    Next
                  </button>
                )}
              </nav>
            )}
          </>
        ))}
    </Panel>
  )
}
