import { Link } from 'react-router-dom'
import { commandCenterPath } from '../app/workspaces'

export function NotFoundPage() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-8 shadow-panel">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight md:text-4xl">Page not found</h1>
      <Link to={commandCenterPath}>Return to Command Center</Link>
    </section>
  )
}
