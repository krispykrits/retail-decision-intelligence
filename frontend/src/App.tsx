import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { ServiceStatus } from './ServiceStatus'
import { workspaces } from './workspaces'

export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link className="brand" to="/command-center">Retail Decision<br />Intelligence</Link>
        <nav aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <NavLink key={workspace.path} to={workspace.path}>{workspace.title}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="content">
        <header className="app-header">
          <span>Retail Decision Intelligence</span>
          <ServiceStatus />
        </header>
        <main id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Navigate to="/command-center" replace />} />
            {workspaces.map((workspace) => (
              <Route key={workspace.path} path={workspace.path} element={
                <>
                  <h1>{workspace.title}</h1>
                  <p className="description">{workspace.description}</p>
                  <section className="empty-state" aria-label="Workspace availability">
                    <h2>Not available yet</h2>
                    <p>This workspace has no data or analysis to display yet.</p>
                  </section>
                </>
              } />
            ))}
            <Route path="*" element={
              <section className="empty-state">
                <h1>Page not found</h1>
                <Link to="/command-center">Return to Command Center</Link>
              </section>
            } />
          </Routes>
        </main>
      </div>
    </div>
  )
}
