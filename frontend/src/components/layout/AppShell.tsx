import { Link, NavLink, Outlet } from 'react-router-dom'
import { workspaces } from '../../app/workspaces'
import { AccountMenu } from '../AccountMenu'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-ink md:flex-row">
      <a className="fixed -top-20 left-4 z-10 bg-surface p-3 focus:top-4" href="#main-content">
        Skip to content
      </a>
      <aside className="border-b border-line bg-sidebar p-4 md:w-60 md:shrink-0 md:border-r md:border-b-0 md:py-6">
        <Link
          className="block px-3 pt-2 pb-5 text-lg leading-tight font-semibold tracking-tight text-ink no-underline md:pb-8"
          to="/command-center"
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
                `rounded-lg border px-3 py-2.5 text-sm no-underline transition-colors ${
                  isActive
                    ? 'border-brand/20 bg-nav-selected font-semibold text-link'
                    : 'border-transparent text-nav hover:bg-nav-hover'
                }`
              }
            >
              {workspace.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-end gap-3 border-b border-line bg-surface px-4 py-3 md:px-8">
          <AccountMenu />
        </header>
        <main className="max-w-7xl px-4 py-6 md:px-8 md:py-10" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
