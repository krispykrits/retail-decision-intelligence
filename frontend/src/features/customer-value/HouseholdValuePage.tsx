import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getHouseholdValue } from '../../api/customerValue'
import { customerIntelligencePath } from '../../app/workspaces'
import { Panel } from '../../components/Panel'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { HouseholdValueDetails } from './HouseholdValueDetails'
import { ValueError, ValueLoading } from './ValueRequestState'
import { useValueRequest } from './useValueRequest'

export function HouseholdValuePage() {
  const { householdId = '' } = useParams()
  const { search } = useLocation()
  const load = useCallback(
    (signal: AbortSignal) => getHouseholdValue(householdId, signal),
    [householdId],
  )
  const { result, retry } = useValueRequest(load)
  const detail = result?.data

  return (
    <div className="space-y-4">
      <WorkspaceHeader path={customerIntelligencePath} />
      <Link
        className="inline-block text-sm font-semibold"
        to={{ pathname: customerIntelligencePath, search }}
      >
        ← Back to Customer Value
      </Link>
      {!result && <ValueLoading label="Loading household value" />}
      {result?.error && <ValueError message="Could not load this household." retry={retry} />}
      {detail && (
        <Panel aria-labelledby="clv-household-detail">
          <HouseholdValueDetails
            householdId={detail.household_id}
            household={detail.future_spend}
            evidence={detail.clv}
          />
        </Panel>
      )}
    </div>
  )
}
