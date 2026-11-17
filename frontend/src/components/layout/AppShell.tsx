import { Link, NavLink, Outlet } from 'react-router-dom'
import { workspaces } from '../../app/workspaces'
import { AccountMenu } from '../../auth/AccountMenu'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-ink md:flex-row">
      <a className="fixed -top-20 left-4 z-10 bg-white p-3 focus:top-4" href="#main-content">
        Skip to content
      </a>
      <aside className="bg-sidebar p-4 text-white md:w-60 md:shrink-0 md:py-6">
        <Link
          className="block px-3 pt-2 pb-4 text-xl font-bold text-white no-underline md:pb-7"
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
                `rounded-lg px-3 py-3.5 no-underline ${
                  isActive ? 'bg-brand font-semibold text-white' : 'text-nav hover:bg-nav-hover'
                }`
              }
            >
              {workspace.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-end gap-3 border-b border-line bg-white p-4 md:px-8 md:py-5">
          <AccountMenu />
        </header>
        <main className="max-w-7xl px-4 py-6 md:px-8 md:py-10" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
