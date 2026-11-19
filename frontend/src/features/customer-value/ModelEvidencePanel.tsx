import type { ModelEvidence } from '../../api/customerValue'
import { DataTable } from '../../components/DataTable'
import { Panel, PanelHeading } from '../../components/Panel'
import { dateAfter, dateLabel, numberLabel } from '../../lib/format'
import { optionalMoney } from './valueDisplay'

export function ModelEvidencePanel({ evidence }: { evidence: ModelEvidence }) {
  const evaluation = evidence.evaluation
  const interval = evaluation?.primary_improvement_95_ci

  return (
    <Panel aria-labelledby="clv-model-evidence">
      <PanelHeading id="clv-model-evidence" title="Model evidence" icon="checklist" />
      <p className="mt-2 text-sm text-muted">{evidence.target}</p>
      {evaluation && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            {evaluation.algorithm} · Baseline: {evaluation.baseline_name}
          </p>
          <DataTable
            columns={{ metric: 'Held-out error', candidate: 'Model', baseline: 'Baseline' }}
          >
            {(['mae', 'rmse'] as const).map((metric) => (
              <tr key={metric}>
                <th scope="row">{metric.toUpperCase()}</th>
                <td>{optionalMoney(evaluation.candidate?.[metric])}</td>
                <td>{optionalMoney(evaluation.baseline?.[metric])}</td>
              </tr>
            ))}
          </DataTable>
          <p className="text-xs text-muted">
            {numberLabel(evaluation.training_rows)} training rows across{' '}
            {numberLabel(evaluation.training_households)} households ·{' '}
            {numberLabel(evaluation.validation_households)} distinct validation households
          </p>
          {interval && (
            <p className="text-xs text-muted">
              95% confidence interval for MAE improvement: {optionalMoney(interval[0])} to{' '}
              {optionalMoney(interval[1])}
            </p>
          )}
        </div>
      )}
      {evidence.version && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-link">
            Run provenance and holdouts
          </summary>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="font-semibold">Run version</dt>
            <dd className="break-all">{evidence.version}</dd>
            <dt className="font-semibold">Trained on</dt>
            <dd>{evidence.trained_at ? dateLabel(evidence.trained_at) : '—'}</dd>
            <dt className="font-semibold">Source dates</dt>
            <dd>
              {evidence.source_first_date && evidence.source_last_date
                ? `${dateLabel(evidence.source_first_date)} – ${dateLabel(evidence.source_last_date)}`
                : '—'}
            </dd>
            <dt className="font-semibold">Source versions</dt>
            <dd>
              Transactions {evidence.transaction_version ?? '—'} · Households{' '}
              {evidence.household_version ?? '—'}
            </dd>
            <dt className="font-semibold">Eligible population</dt>
            <dd>{evidence.population}</dd>
          </dl>
          {evaluation && evaluation.folds.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted">
                Each fold trains on rows whose outcomes were known by its validation cutoff.
              </p>
              <DataTable
                columns={{
                  cutoff: 'Cutoff',
                  window: 'Validation outcome dates',
                  training: 'Training rows',
                  validation: 'Validation households',
                  model: 'Model MAE',
                  baseline: 'Baseline MAE',
                }}
                viewportLabel="Held-out evaluation by cutoff"
              >
                {evaluation.folds.map((fold) => (
                  <tr key={fold.cutoff}>
                    <th scope="row" className="whitespace-nowrap">
                      {dateLabel(fold.cutoff)}
                    </th>
                    <td>
                      {dateAfter(fold.cutoff, 1)} – {dateLabel(fold.target_through)}
                    </td>
                    <td>{numberLabel(fold.training_rows)}</td>
                    <td>{numberLabel(fold.validation_households)}</td>
                    <td>{optionalMoney(fold.candidate.mae)}</td>
                    <td>{optionalMoney(fold.baseline.mae)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}
          {evidence.caveats && evidence.caveats.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
              {evidence.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </Panel>
  )
}
