import type { Workspace } from '../app/workspaces'

type WorkspacePageProps = {
  workspace: Workspace
}

export function WorkspacePage({ workspace }: WorkspacePageProps) {
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight md:text-4xl">{workspace.title}</h1>
      <p className="mb-8 text-muted">{workspace.description}</p>
      <section
        className="rounded-2xl border border-line bg-surface p-8 shadow-panel"
        aria-label="Workspace availability"
      >
        <h2 className="mb-4 text-lg font-semibold">Not available yet</h2>
        <p className="leading-relaxed text-muted">
          This workspace has no data or analysis to display yet.
        </p>
      </section>
    </>
  )
}
