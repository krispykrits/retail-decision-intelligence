import type { ImportResult } from '../../api/imports'

const statusLabel = {
  completed: 'Completed',
  completed_with_errors: 'Completed with errors',
  failed: 'Failed',
} as const

export function ImportResults({ results }: { results: ImportResult[] }) {
  return (
    <ul className="divide-y divide-line">
      {results.map((result) => (
        <li key={result.import_id} className="py-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <strong className="break-all">{result.filename}</strong>
            <time className="text-muted" dateTime={result.finished_at}>
              {new Date(result.finished_at).toLocaleString()}
            </time>
          </div>
          <p className="mt-1">
            <span
              className={
                result.status === 'completed'
                  ? 'font-semibold text-success'
                  : 'font-semibold text-error'
              }
            >
              {statusLabel[result.status]}
            </span>
            {' · '}
            {result.processed.toLocaleString()} processed · {result.inserted.toLocaleString()} added
            {' · '}
            {result.duplicates_skipped.toLocaleString()} skipped ·{' '}
            {result.conflicts.toLocaleString()} conflicts
            {' · '}
            {result.rejected.toLocaleString()} rejected
          </p>
          {result.detail && <p className="mt-1 text-error">{result.detail}</p>}
          {!!result.errors.length && (
            <details className="mt-2">
              <summary className="cursor-pointer text-link">
                {result.errors.length < result.conflicts + result.rejected
                  ? `First ${result.errors.length} row errors`
                  : 'Row errors'}
              </summary>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {result.errors.map((error) => (
                  <li key={error.row_number}>
                    Row {error.row_number.toLocaleString()} · {error.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  )
}
