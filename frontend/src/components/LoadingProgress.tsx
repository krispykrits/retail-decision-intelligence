export function LoadingProgress({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-nav-selected ${className}`}
    >
      <span className="block h-full w-1/3 rounded-full bg-brand motion-safe:animate-filter-progress" />
    </span>
  )
}
