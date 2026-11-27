import { NavLink } from 'react-router-dom'
import { customerIntelligencePath, retentionPath } from '../../app/workspaces'

const sections = [
  { label: 'Segmentation & Behavior' },
  { label: 'Customer Value (CLV)', path: customerIntelligencePath },
  { label: 'Retention & Churn', path: retentionPath },
  { label: 'External Factors' },
  { label: 'Customer Explorer' },
]

export function CustomerTabs() {
  const base = 'shrink-0 border-b-2 px-3 py-2 text-sm'
  return (
    <nav
      aria-label="Customer Intelligence sections"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {sections.map(({ label, path }) =>
        path ? (
          <NavLink
            key={label}
            to={path}
            end
            className={({ isActive }) =>
              `${base} ${isActive ? 'border-brand font-semibold text-link' : 'border-transparent text-muted hover:text-link'}`
            }
          >
            {label}
          </NavLink>
        ) : (
          <span
            key={label}
            aria-disabled="true"
            className={`${base} border-transparent text-muted`}
          >
            {label}
          </span>
        ),
      )}
    </nav>
  )
}
