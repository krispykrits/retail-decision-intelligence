import { useEffect, useRef, useState } from 'react'
import type { ModelEvidence, PredictionPage } from '../../api/customerValue'
import { DataTable } from '../../components/DataTable'
import { LoadingProgress } from '../../components/LoadingProgress'
import { Skeleton } from '../../components/Skeleton'
import { Panel, PanelHeading } from '../../components/Panel'
import { dateLabel, numberLabel } from '../../lib/format'
import { HouseholdValueDetails } from './HouseholdValueDetails'
import type { ValueResult } from './useValueRequest'
import { forecastLabel, isAvailable, optionalMoney } from './valueDisplay'
import { ValueError } from './ValueRequestState'

export function ValueRanking({
  result,
  observedPeriod,
  page,
  evidence,
  selectPage,
  retry,
}: {
  result?: ValueResult<PredictionPage>
  observedPeriod?: { start: string; end: string }
  page: number
  evidence: ModelEvidence
  selectPage: (page: number) => void
  retry: () => void
}) {
  const [selectedId, setSelectedId] = useState<string>()
  const backButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const data = result?.data
  const selected = data?.items.find((row) => row.household_id === selectedId)

  useEffect(() => {
    if (selected) {
      backButton.current?.focus({ preventScroll: true })
    } else if (opener.current) {
      opener.current.focus({ preventScroll: true })
      opener.current = null
    }
  }, [selected])

  const available = isAvailable(evidence)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const columns = {
    id: 'Household',
    region: 'Region',
    historical: 'Observed · 90 days',
    forecast: `${evidence.horizon_days}-day forecast`,
  }

  return (
    <Panel id="household-spending" tabIndex={-1} aria-labelledby="clv-households">
      <PanelHeading
        id="clv-households"
        title="Household value detail"
        icon="/customers"
        className="relative"
      >
        Compare what each household spent in the past 90 days with its expected spending in the next
        90 days. Select a household for more detail.
      </PanelHeading>
      {selected && (
        <div className="mt-3" role="region" aria-labelledby="clv-household-detail">
          <button
            ref={backButton}
            type="button"
            className="mb-3 text-sm font-semibold text-link hover:underline"
            onClick={() => setSelectedId(undefined)}
          >
            ← Back to households
          </button>
          <HouseholdValueDetails
            householdId={selected.household_id}
            household={selected}
            evidence={evidence}
          />
        </div>
      )}
      <div hidden={Boolean(selected)}>
        <p className="mt-2 mb-4 text-sm text-muted">
          {available ? 'Highest forecast first.' : 'Recorded spending for the households in view.'}
          {observedPeriod && (
            <>
              {' '}
              Observed {dateLabel(observedPeriod.start)} – {dateLabel(observedPeriod.end)}.
            </>
          )}
        </p>
        {!result && (
          <div role="status" className="relative">
            <span className="sr-only">Loading households…</span>
            <DataTable columns={columns} busy>
              {[1, 2, 3, 4, 5].map((row) => (
                <tr key={row} aria-hidden="true">
                  {Object.keys(columns).map((column) => (
                    <td key={column}>
                      <Skeleton className="h-4 w-16 max-w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </DataTable>
            <LoadingProgress />
          </div>
        )}
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
                      <button
                        type="button"
                        className="font-semibold text-link underline-offset-2 hover:underline"
                        onClick={(event) => {
                          opener.current = event.currentTarget
                          setSelectedId(row.household_id)
                        }}
                      >
                        {row.household_id}
                      </button>
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
      </div>
    </Panel>
  )
}
