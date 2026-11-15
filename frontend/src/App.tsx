import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { ServiceStatus } from './ServiceStatus'
import { workspaces } from './workspaces'

export function App() {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas font-sans text-ink min-[721px]:grid-cols-[15rem_minmax(0,1fr)]">
      <a className="fixed -top-20 left-4 z-10 bg-white p-3 focus:top-4" href="#main-content">Skip to content</a>
      <aside className="bg-sidebar p-4 text-white min-[721px]:py-6">
        <Link className="block px-3 pt-2 pb-4 text-xl font-bold text-white no-underline min-[721px]:pb-7" to="/command-center">Retail Decision<br />Intelligence</Link>
        <nav className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-1.5 min-[721px]:grid-cols-1" aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <NavLink
              key={workspace.path}
              to={workspace.path}
              className={({ isActive }) => `rounded-lg px-3 py-3.5 no-underline ${
                isActive ? 'bg-brand font-semibold text-white' : 'text-nav hover:bg-nav-hover'
              }`}
            >{workspace.title}</NavLink>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-4 min-[721px]:px-8 min-[721px]:py-5">
          <span>Retail Decision Intelligence</span>
          <ServiceStatus />
        </header>
        <main className="max-w-[85rem] px-4 py-6 min-[721px]:px-8 min-[721px]:py-10" id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Navigate to="/command-center" replace />} />
            {workspaces.map((workspace) => (
              <Route key={workspace.path} path={workspace.path} element={
                <>
                  <h1 className="mb-2 text-[clamp(1.7rem,3vw,2.2rem)] font-bold">{workspace.title}</h1>
                  <p className="mb-8 text-muted">{workspace.description}</p>
                  <section className="rounded-xl border border-line bg-white p-8" aria-label="Workspace availability">
                    <h2 className="mb-4 text-lg font-semibold">Not available yet</h2>
                    <p className="leading-relaxed text-muted">This workspace has no data or analysis to display yet.</p>
                  </section>
                </>
              } />
            ))}
            <Route path="*" element={
              <section className="rounded-xl border border-line bg-white p-8">
                <h1 className="mb-2 text-[clamp(1.7rem,3vw,2.2rem)] font-bold">Page not found</h1>
                <Link to="/command-center">Return to Command Center</Link>
              </section>
            } />
          </Routes>
        </main>
      </div>
    </div>
  )
}
