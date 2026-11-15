import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="rounded-xl border border-line bg-white p-8">
      <h1 className="mb-2 text-3xl font-bold md:text-4xl">Page not found</h1>
      <Link to="/command-center">Return to Command Center</Link>
    </section>
  )
}
