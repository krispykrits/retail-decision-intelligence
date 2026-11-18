import type { Workspace } from '../app/workspaces'

const iconPaths: Record<Workspace['path'], string> = {
  '/command-center': 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  '/customers':
    'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M12.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M16 3.3a4 4 0 0 1 0 7.4 M22 21v-2a4 4 0 0 0-4-4',
  '/merchandise': 'M3 4h8l10 10-7 7L3 10V4Z M8 8h.01',
  '/baskets':
    'M3 10h18l-2 9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2l-2-9Z M7 10l4-7 M17 10l-4-7 M9 14l.5 3.5 M15 14l-.5 3.5',
  '/forecast': 'M3 3v18h18 M6 16l5-5 4 2 6-7 M16 6h5v5',
  '/households': 'm3 10 9-7 9 7 M5 9v12h14V9 M10 21v-6h4v6',
  '/data': 'M20 6a8 3 0 1 1-16 0 8 3 0 0 1 16 0Z M4 6v12a8 3 0 0 0 16 0V6 M4 12a8 3 0 0 0 16 0',
}

export function WorkspaceIcon({ path }: { path: Workspace['path'] }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[path]} />
    </svg>
  )
}
