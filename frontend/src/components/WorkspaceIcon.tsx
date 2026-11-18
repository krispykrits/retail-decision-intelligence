import type { Workspace } from '../app/workspaces'

const iconPaths = {
  '/command-center': 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  '/customers':
    'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M12.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M16 3.3a4 4 0 0 1 0 7.4 M22 21v-2a4 4 0 0 0-4-4',
  '/merchandise': 'M3 4h8l10 10-7 7L3 10V4Z M8 8h.01',
  '/baskets':
    'M3 10h18l-2 9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2l-2-9Z M7 10l4-7 M17 10l-4-7 M9 14l.5 3.5 M15 14l-.5 3.5',
  '/forecast': 'M3 3v18h18 M6 16l5-5 4 2 6-7 M16 6h5v5',
  '/households': 'm3 10 9-7 9 7 M5 9v12h14V9 M10 21v-6h4v6',
  '/data': 'M20 6a8 3 0 1 1-16 0 8 3 0 0 1 16 0Z M4 6v12a8 3 0 0 0 16 0V6 M4 12a8 3 0 0 0 16 0',
  wallet:
    'M3 6a2 2 0 0 1 2-2h13v4H5a2 2 0 0 1 0-4 M3 6v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1 M21 12h-5a2 2 0 0 0 0 4h5 M16 14h.01',
  calculator:
    'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M8 7h8 M8 11h.01 M12 11h.01 M16 11h.01 M8 15h.01 M12 15h.01 M16 15v2 M8 18h.01 M12 18h.01',
  pie: 'M11 3a9 9 0 1 0 10 10H11z M14 3a8 8 0 0 1 7 7h-7z',
  search: 'M15.5 15.5 21 21 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  checklist: 'M4 6l1.5 1.5L8 5 M11 6h9 M4 12l1.5 1.5L8 11 M11 12h9 M4 18l1.5 1.5L8 17 M11 18h9',
  upload: 'M12 16V3 M7 8l5-5 5 5 M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 7v5l3 2',
  calendar:
    'M8 3v4 M16 3v4 M3 10h18 M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  chevron: 'm6 9 6 6 6-6',
}

export type IconName = keyof typeof iconPaths

export function WorkspaceIcon({
  path,
  className,
}: {
  path: Workspace['path']
  className?: string
}) {
  return <Icon name={path} className={className} />
}

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  )
}
