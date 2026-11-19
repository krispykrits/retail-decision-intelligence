import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCustomerValue,
  getHouseholdValue,
  getRankedHouseholds,
  type HouseholdPrediction,
  type ModelEvidence,
  type ModelSummary,
} from '../api/customerValue'
import { App } from '../app/App'
import { SessionContext } from '../auth/session'

vi.mock('../api/customerValue', () => ({
  getCustomerValue: vi.fn(),
  getHouseholdValue: vi.fn(),
  getRankedHouseholds: vi.fn(),
}))

const evidence: ModelEvidence = {
  model: 'clv',
  status: 'available',
  reason: 'Held-out improvement cleared the gates.',
  version: '00000000-0000-4000-8000-000000000001',
  as_of: '2020-08-15',
  source_first_date: '2018-08-17',
  source_last_date: '2020-08-15',
  transaction_version: 2,
  household_version: 7,
  history_days: 180,
  horizon_days: 90,
  target: 'Net household spend over the next 90 days.',
  population: 'Households with a qualifying purchase in the last 180 days.',
  evaluation: {
    eligible: true,
    reason: 'Passed',
    algorithm: 'Histogram gradient boosting regression',
    baseline_name: 'Previous 90-day net spend',
    candidate: { mae: 294.21, rmse: 433.82 },
    baseline: { mae: 314.34, rmse: 449.51 },
    threshold: null,
    training_first_cutoff: null,
    training_last_cutoff: null,
    training_rows: 5713,
    training_households: 396,
    training_positive_rows: null,
    validation_households: 373,
    validation_positive_rows: null,
    primary_improvement_95_ci: [10.7, 27.86],
    folds: [
      {
        cutoff: '2020-05-17',
        target_through: '2020-08-15',
        training_rows: 4665,
        validation_rows: 350,
        validation_households: 350,
        candidate: { mae: 309.47 },
        baseline: { mae: 354.95 },
      },
    ],
  },
}

const household: HouseholdPrediction = {
  household_id: '001994',
  region: 'CENTRAL',
  loyalty_flag: 'Y',
  age_range: null,
  household_size: null,
  last_purchase: '2020-08-13',
  recency_days: 2,
  purchase_days_180d: 34,
  observed_spend_180d: '1774.5300',
  observed_spend_90d: '834.25',
  eligible: true,
  forecast: 875.42,
}

const summary: ModelSummary = {
  evidence,
  observed_households: 26,
  eligible_households: 25,
  scored_households: 25,
  mean_future_spend: 985.24,
  distribution: [{ lower: 500, upper: 1500, count: 25 }],
  observed_spend_segments: [
    { segment: 'higher_spend', households: 20, net_spend: '3800.00' },
    { segment: 'frequent', households: 6, net_spend: '700.10' },
  ],
  observed_spend_by_loyalty: [
    { loyalty_flag: 'Y', households: 20, net_spend: '3800.00' },
    { loyalty_flag: 'N', households: 6, net_spend: '700.10' },
  ],
  historical_spend: [
    { start: '2020-02-18', end: '2020-05-17', net_spend: '3012.23' },
    { start: '2020-05-18', end: '2020-08-15', net_spend: '4500.10' },
  ],
}

function openCustomerValue(path = '/customers') {
  render(
    <SessionContext.Provider
      value={{
        account: {
          id: 'test-analyst',
          email: 'analyst@example.com',
          display_name: 'Retail analyst',
          roles: ['Analyst'],
        },
        status: 'ready',
        logout: vi.fn(),
        refresh: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </SessionContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCustomerValue).mockResolvedValue(summary)
  vi.mocked(getRankedHouseholds).mockResolvedValue({
    evidence,
    items: [
      household,
      ...['002001', '002002', '002003', '002004'].map((household_id) => ({
        ...household,
        household_id,
        observed_spend_90d: '570.00',
        forecast: 605.48,
      })),
    ],
    total: 26,
    page: 1,
    page_size: 5,
  })
})

describe('Customer Value', () => {
  it('shows historical spending, segments and a ranked forecast without ML details', async () => {
    const user = userEvent.setup()
    openCustomerValue()

    const ranking = await screen.findByRole('region', { name: 'Household value results' })
    expect(within(ranking).getByText('$834.25')).toBeVisible()
    expect(within(ranking).getByText('$875.42')).toBeVisible()
    expect(within(ranking).getByRole('columnheader', { name: /forecast/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    const history = screen.getByRole('group', {
      name: 'Observed household net spend by 90-day period',
    })
    const lastPeriod = within(history).getByRole('button', {
      name: /May 18, 2020.*Aug 15, 2020.*4,500.10/,
    })
    await user.click(lastPeriod)
    const chartTooltip = document.getElementById(lastPeriod.getAttribute('aria-describedby') ?? '')
    expect(chartTooltip).toHaveTextContent('Observed net spend')
    expect(chartTooltip).not.toHaveTextContent('Difference')
    for (const label of [
      'the Customer Value overview',
      'Households',
      'Observed spend · last 90 days',
      'Average per household · last 90 days',
      'Forecast status',
      'Historical household value trend',
      'Observed spend by loyalty membership',
      '90-day outlook',
      'Household value detail',
      'Key takeaways',
    ]) {
      const help = screen.getByRole('button', { name: `How ${label} is determined` })
      expect(help.getAttribute('aria-describedby')).toBeTruthy()
    }
    expect(screen.queryByText('$294.21')).not.toBeInTheDocument()
    expect(screen.queryByText(evidence.version!)).not.toBeInTheDocument()
    expect(screen.getByText(/Aug 16, 2020.*Nov 13, 2020/)).toBeVisible()
    expect(screen.getByText(/Observed spending · May 18, 2020.*Aug 15, 2020/)).toBeVisible()
    expect(document.querySelector('input[type="date"]')).toBeNull()

    expect(
      screen.getByRole('heading', { name: 'Observed spend by loyalty membership' }),
    ).toBeVisible()
    expect(
      within(
        screen.getByRole('region', { name: 'Observed spend by loyalty membership' }),
      ).getByText('$190.00'),
    ).toBeVisible()
    expect(
      screen.getByText('Members spent $73.32 more per household than non-members.'),
    ).toBeVisible()
    expect(screen.getByText('+49.4%')).toBeVisible()
    const takeaways = within(screen.getByRole('region', { name: 'Key takeaways' }))
    expect(takeaways.getByText(/rose by 49.4% compared with the previous 90 days/)).toBeVisible()
    expect(takeaways.getByText(/Loyalty members averaged \$190.00/)).toBeVisible()
    expect(takeaways.getByText(/25 of 26 households have a forecast/)).toBeVisible()
    expect(takeaways.getByRole('link', { name: /Review households/ })).toHaveAttribute(
      'href',
      '#household-spending',
    )
    expect(within(ranking).getAllByRole('row')).toHaveLength(6)
    expect(screen.getByText('1–5 of 26')).toBeVisible()

    await user.click(screen.getByText('View spending ranges'))
    expect(screen.getByRole('progressbar', { name: /Households forecast/ })).toHaveValue(25)
  })

  it.each([
    ['Y', 'loyalty members'],
    ['N', 'non-members'],
  ] as const)('shows shopping segments when loyalty is %s', async (loyalty, label) => {
    const user = userEvent.setup()
    vi.mocked(getCustomerValue)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({
        ...summary,
        loyalty_filter: loyalty,
        observed_spend_by_loyalty: summary.observed_spend_by_loyalty?.filter(
          (row) => row.loyalty_flag === loyalty,
        ),
      })
    openCustomerValue()
    await screen.findByRole('heading', { name: 'Observed spend by loyalty membership' })
    await user.selectOptions(screen.getByLabelText('Loyalty membership'), loyalty)
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    const card = within(
      await screen.findByRole('region', { name: 'Observed spend by customer segment' }),
    )
    expect(card.getByText(new RegExp(`Showing ${label} only`, 'i'))).toBeVisible()
    expect(card.getByText('Higher-spend households')).toBeVisible()
    expect(card.getByText('Frequent shoppers')).toBeVisible()
    expect(card.queryByText(/Members spent/)).not.toBeInTheDocument()
  })

  it('preserves the overview while filters update and announces what is loading', async () => {
    const user = userEvent.setup()
    let finishInitial!: (value: ModelSummary) => void
    let finishUpdate!: (value: ModelSummary) => void
    vi.mocked(getCustomerValue)
      .mockReturnValueOnce(
        new Promise<ModelSummary>((resolve) => {
          finishInitial = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise<ModelSummary>((resolve) => {
          finishUpdate = resolve
        }),
      )
    openCustomerValue()

    expect(screen.getByText('Loading household spending…')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Historical household value trend' }),
    ).not.toBeInTheDocument()

    finishInitial(summary)
    await screen.findByRole('region', { name: 'Household value results' })
    const history = screen.getByRole('region', { name: 'Historical household value trend' })
    await user.selectOptions(screen.getByLabelText('Store region'), 'CENTRAL')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(screen.getByText('Updating household spending…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Applying filters…' })).toBeVisible()
    expect(history).toBeInTheDocument()
    expect(history.closest('[aria-busy="true"]')).toHaveAttribute('inert')
    expect(getRankedHouseholds).toHaveBeenCalledTimes(1)

    finishUpdate({ ...summary })
    await waitFor(() => expect(getRankedHouseholds).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Updating household spending…')).not.toBeInTheDocument()
    expect(history.closest('[aria-busy="true"]')).toBeNull()
  })

  it('filters cohorts, resets pagination, and retains the selection through household detail', async () => {
    const user = userEvent.setup()
    vi.mocked(getHouseholdValue).mockResolvedValue({
      household_id: household.household_id,
      clv: evidence,
      churn: { ...evidence, model: 'churn', status: 'not_run' },
      future_spend: household,
      churn_risk: null,
    })
    openCustomerValue('/customers?page=2')

    await screen.findByRole('link', { name: household.household_id })
    expect(getRankedHouseholds).toHaveBeenLastCalledWith(expect.anything(), 2, expect.anything())
    await user.selectOptions(screen.getByLabelText('Store region'), 'CENTRAL')
    await user.selectOptions(screen.getByLabelText('Loyalty membership'), 'Y')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    const link = await screen.findByRole('link', { name: household.household_id })
    expect(getCustomerValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ region: 'CENTRAL', loyalty_flag: 'Y' }),
      expect.anything(),
    )
    expect(getRankedHouseholds).toHaveBeenLastCalledWith(
      expect.objectContaining({ region: 'CENTRAL', loyalty_flag: 'Y' }),
      1,
      expect.anything(),
    )
    expect(link).toHaveAttribute(
      'href',
      '/customers/households/001994?region=CENTRAL&loyalty_flag=Y',
    )
    await user.click(link)
    expect(await screen.findByRole('heading', { name: 'Household 001994' })).toBeVisible()
    expect(screen.getByText('$875.42')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'How Last purchase is determined' }),
    ).toHaveAccessibleDescription('The latest purchase date in the records used for this view.')
    expect(getHouseholdValue).toHaveBeenCalledWith('001994', expect.anything())
    expect(screen.getByRole('link', { name: /Back to Customer Value/ })).toHaveAttribute(
      'href',
      '/customers?region=CENTRAL&loyalty_flag=Y',
    )
  })

  it.each(['stale', 'unavailable'] as const)(
    'suppresses forecasts when model status is %s',
    async (status) => {
      const rejected = { ...evidence, status, reason: 'Refresh model evaluation.' }
      vi.mocked(getCustomerValue).mockResolvedValue({
        ...summary,
        historical_spend: status === 'stale' ? [] : summary.historical_spend,
        observed_spend_segments: status === 'stale' ? [] : summary.observed_spend_segments,
        evidence: rejected,
      })
      vi.mocked(getRankedHouseholds).mockResolvedValue({
        evidence: rejected,
        items: [{ ...household, observed_spend_90d: status === 'stale' ? null : '834.25' }],
        total: 1,
        page: 1,
        page_size: 5,
      })
      openCustomerValue()

      const ranking = await screen.findByRole('region', { name: 'Household value results' })
      expect(within(ranking).getByText(status === 'stale' ? '—' : '$834.25')).toBeVisible()
      expect(within(ranking).getByText('Unavailable')).toBeVisible()
      expect(within(ranking).queryByText('$875.42')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('progressbar', { name: /Households forecast/ }),
      ).not.toBeInTheDocument()
      if (status === 'stale') {
        expect(screen.getByText(/spending history is paused/i)).toBeVisible()
      } else {
        expect(screen.getByRole('group', { name: /Observed household net spend/ })).toBeVisible()
      }
    },
  )

  it('shows an unevaluated state without requesting rankings', async () => {
    vi.mocked(getCustomerValue).mockResolvedValue({
      ...summary,
      historical_spend: [],
      evidence: { ...evidence, version: null, evaluation: null, as_of: null, status: 'not_run' },
    })
    openCustomerValue()

    expect(await screen.findByText('Not evaluated')).toBeVisible()
    expect(getRankedHouseholds).not.toHaveBeenCalled()
    expect(screen.queryByText('$985.24')).not.toBeInTheDocument()
  })

  it('distinguishes an older API from a cohort with no spending history', async () => {
    vi.mocked(getCustomerValue).mockResolvedValue({ ...summary, historical_spend: undefined })
    openCustomerValue()

    expect(await screen.findByText('Spending history needs a newer app version.')).toBeVisible()
    expect(screen.queryByText(/fewer than 90 days/)).not.toBeInTheDocument()
  })

  it('refreshes both views when the ranking came from a different model run', async () => {
    const user = userEvent.setup()
    vi.mocked(getRankedHouseholds).mockResolvedValueOnce({
      evidence: { ...evidence, version: 'previous-run' },
      items: [household],
      total: 1,
      page: 1,
      page_size: 5,
    })
    openCustomerValue()

    expect(await screen.findByRole('alert')).toHaveTextContent('model or source data changed')
    expect(screen.queryByText('$875.42')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(getCustomerValue).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('$875.42')).toBeVisible()
  })
})
