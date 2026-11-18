export function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-line motion-safe:animate-pulse ${className}`}
    />
  )
}
