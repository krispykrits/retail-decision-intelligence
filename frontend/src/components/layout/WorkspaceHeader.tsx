import type { ReactNode } from 'react'
import { workspaces, type Workspace } from '../../app/workspaces'
import { AccountMenu } from '../AccountMenu'
import { WorkspaceIcon } from '../WorkspaceIcon'

export function WorkspaceHeader({
  path,
  status,
  children,
}: {
  path: Workspace['path']
  status?: string
  children?: ReactNode
}) {
  const workspace = workspaces.find((item) => item.path === path)
  return (
    <header
      className={`grid items-start gap-3 border-b border-line pb-3 md:grid-cols-[minmax(0,1fr)_auto] ${children ? 'xl:grid-cols-[minmax(0,1fr)_auto_auto]' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <WorkspaceIcon path={path} className="size-8 shrink-0 text-brand" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{workspace?.title}</h1>
          <p className="mt-0.5 text-sm text-muted" role={status ? 'status' : undefined}>
            {status ?? workspace?.description}
          </p>
        </div>
      </div>
      <div
        className={`contents md:col-start-2 md:row-start-1 md:block md:max-w-72 md:justify-self-end ${children ? 'xl:col-start-3' : ''}`}
      >
        <AccountMenu />
      </div>
      {children}
    </header>
  )
}
