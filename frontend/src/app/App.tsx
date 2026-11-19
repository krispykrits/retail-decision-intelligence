import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { NotFoundPage } from '../pages/NotFoundPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import {
  commandCenterPath,
  customerIntelligencePath,
  dataOperationsPath,
  workspaces,
  type Workspace,
} from './workspaces'
import { RequireAccount } from '../auth/RequireAccount'
import { AccountPage } from '../features/accounts/AccountPage'
import { DataOperationsPage } from '../features/data-operations/DataOperationsPage'
import { CommandCenterPage } from '../features/dashboard/CommandCenterPage'

import { CustomerValuePage } from '../features/customer-value/CustomerValuePage'
import { HouseholdValuePage } from '../features/customer-value/HouseholdValuePage'

const workspacePages: Partial<Record<Workspace['path'], typeof CommandCenterPage>> = {
  [commandCenterPath]: CommandCenterPage,
  [dataOperationsPath]: DataOperationsPage,
  [customerIntelligencePath]: CustomerValuePage,
}

export function App() {
  return (
    <Routes>
      <Route path="/account/:mode" element={<AccountPage />} />
      <Route element={<RequireAccount />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={commandCenterPath} replace />} />
          {workspaces.map((workspace) => {
            const Page = workspacePages[workspace.path]
            return (
              <Route
                key={workspace.path}
                path={workspace.path}
                element={Page ? <Page /> : <WorkspacePage workspace={workspace} />}
              />
            )
          })}
          <Route
            path={`${customerIntelligencePath}/households/:householdId`}
            element={<HouseholdValuePage />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
