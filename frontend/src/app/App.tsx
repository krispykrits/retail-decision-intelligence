import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { NotFoundPage } from '../pages/NotFoundPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import { workspaces, type Workspace } from './workspaces'
import { RequireAccount } from '../auth/RequireAccount'
import { AccountPage } from '../pages/AccountPage'
import { DataOperationsPage } from '../pages/DataOperationsPage'
import { CommandCenterPage } from '../pages/CommandCenterPage'

const workspacePages: Partial<Record<Workspace['path'], typeof CommandCenterPage>> = {
  '/command-center': CommandCenterPage,
  '/data': DataOperationsPage,
}

export function App() {
  return (
    <Routes>
      <Route path="/account/:mode" element={<AccountPage />} />
      <Route element={<RequireAccount />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/command-center" replace />} />
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
