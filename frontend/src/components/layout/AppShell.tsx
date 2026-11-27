import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import {
  commandCenterPath,
  customerIntelligencePath,
  dataOperationsPath,
  workspaces,
} from '../../app/workspaces'
import { AccountMenu } from '../AccountMenu'
import { WorkspaceIcon } from '../WorkspaceIcon'

export function AppShell() {
  const isCommandCenter = useMatch(commandCenterPath)
  const isDataOperations = useMatch(dataOperationsPath)
  const isCustomerIntelligence = useMatch(`${customerIntelligencePath}/*`)
  const hasWorkspaceHeader = Boolean(isCommandCenter || isDataOperations || isCustomerIntelligence)
  return (
    <div className="flex min-h-screen flex-col bg-canvas pt-13 font-sans text-ink md:flex-row md:pt-0">
      <a className="fixed -top-20 left-4 z-10 bg-surface p-3 focus:top-4" href="#main-content">
        Skip to content
      </a>
      <aside
        className={`border-b border-line bg-sidebar p-4 md:shrink-0 md:border-r md:border-b-0 md:py-6 ${hasWorkspaceHeader ? 'md:w-58' : 'md:w-64'}`}
      >
        <Link
          className="block px-3 pt-2 pb-5 text-lg leading-tight font-semibold tracking-tight text-ink no-underline md:pb-8"
          to={commandCenterPath}
        >
          Retail Decision
          <br />
          Intelligence
        </Link>
        <nav className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-1" aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <NavLink
              key={workspace.path}
              to={workspace.path}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm no-underline transition-colors ${
                  isActive
                    ? 'border-brand/20 bg-nav-selected font-semibold text-link'
                    : 'border-transparent text-nav hover:bg-nav-hover'
                }`
              }
            >
              <WorkspaceIcon path={workspace.path} />
              <span>{workspace.title}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        {!hasWorkspaceHeader && (
          <header className="md:flex md:flex-wrap md:items-center md:justify-end md:gap-3 md:border-b md:border-line md:bg-surface md:px-8 md:py-3">
            <AccountMenu />
          </header>
        )}
        <main
          className={
            hasWorkspaceHeader
              ? 'mx-auto max-w-400 p-4 lg:p-5'
              : 'max-w-7xl px-4 py-6 md:px-8 md:py-10'
          }
          id="main-content"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
