import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { NotFoundPage } from '../pages/NotFoundPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import { workspaces } from './workspaces'
import { RequireAccount } from '../auth/RequireAccount'
import { AccountPage } from '../pages/AccountPage'
import { DataOperationsPage } from '../pages/DataOperationsPage'

export function App() {
  return (
    <Routes>
      <Route path="/account/:mode" element={<AccountPage />} />
      <Route element={<RequireAccount />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/command-center" replace />} />
          {workspaces.map((workspace) => (
            <Route
              key={workspace.path}
              path={workspace.path}
              element={
                workspace.path === '/data' ? (
                  <DataOperationsPage />
                ) : (
                  <WorkspacePage workspace={workspace} />
                )
              }
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
