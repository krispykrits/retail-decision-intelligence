import { useCallback } from 'react'
import { getDatasets, getImportHistory } from '../../api/imports'
import { useSession } from '../../auth/session'
import { WorkspaceHeader } from '../../components/layout/WorkspaceHeader'
import { HistoryPanel } from './HistoryPanel'
import { InventoryPanel } from './InventoryPanel'
import { UploadPanel } from './UploadPanel'
import { useImportQueue } from './useImportQueue'
import { useRows } from './useRows'
import { dataOperationsPath } from '../../app/workspaces'

export function DataOperationsPage() {
  const { account } = useSession()
  const administrator = account?.roles.includes('Administrator') ?? false
  const inventory = useRows(getDatasets)
  const history = useRows(getImportHistory, administrator)
  const { refresh: refreshInventory } = inventory
  const { refresh: refreshHistory } = history
  const refresh = useCallback(() => {
    refreshInventory()
    refreshHistory()
  }, [refreshInventory, refreshHistory])
  const queue = useImportQueue(administrator, refresh)

  return (
    <div className="space-y-3 md:space-y-4">
      <WorkspaceHeader path={dataOperationsPath} />
      <div
        className={`grid gap-3 md:gap-4 ${administrator ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}`}
      >
        {administrator && <UploadPanel queue={queue} />}
        <InventoryPanel inventory={inventory} administrator={administrator} />
        {administrator && <HistoryPanel history={history} />}
      </div>
    </div>
  )
}
