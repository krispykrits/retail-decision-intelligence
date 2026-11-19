import { Link, useLocation } from 'react-router-dom'
import type { ModelEvidence, PredictionPage } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { numberLabel } from '../../lib/format'
import type { ValueResult } from './useValueRequest'
import { forecastLabel, isAvailable, optionalMoney } from './valueDisplay'
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
    historical: 'Observed · 90 days',
    forecast: `${evidence.horizon_days}-day forecast`,
  }

  return (
    <Panel aria-labelledby="clv-households">
      <PanelHeading id="clv-households" title="Household value detail" icon="/customers" />
      <p className="mt-2 mb-4 text-sm text-muted">
        {available ? 'Highest forecast first.' : 'Recorded spending for the households in view.'}
      </p>
      {!result && <ValueLoading label="Loading households" />}
      {result?.error && <ValueError message="Could not load households." retry={retry} />}
      {data &&
        (data.items.length === 0 && page === 1 ? (
          <p className="text-sm text-muted">No households match your filters.</p>
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
                  <td>{optionalMoney(row.observed_spend_90d)}</td>
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
                  {data.items.length > 0
                    ? `${numberLabel((data.page - 1) * data.page_size + 1)}–${numberLabel((data.page - 1) * data.page_size + data.items.length)} of ${numberLabel(data.total)}`
                    : 'This page has no households.'}
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
