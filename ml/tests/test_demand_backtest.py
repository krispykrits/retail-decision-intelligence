from datetime import date, timedelta

import pytest

from ml.demand_forecasts.backtest import backtest, error_metrics
from retail_api.forecasts.queries import WEEK


def test_each_forecast_uses_only_data_available_at_its_cutoff() -> None:
    start = date(2018, 1, 1)
    weeks = [start + index * WEEK for index in range(80)]
    units = {week: 50 + index % 13 + index for index, week in enumerate(weeks)}
    result = backtest(start, len(weeks), set(weeks), units, len(units))
    assert result.status == "completed"
    for horizon, row in enumerate(result.horizons, start=1):
        assert row.horizon == horizon
        assert row.weeks_tested == 26
        assert row.training_samples_max > row.training_samples_min
        assert [point.week_start for point in row.points] == weeks[-26:]
        for point in row.points:
            assert point.forecast_cutoff == point.week_start - horizon * WEEK + timedelta(days=6)
            assert point.baseline == units[point.week_start - 52 * WEEK]
        actual = [point.actual for point in row.points]
        assert row.average_miss == pytest.approx(
            sum(abs(point.actual - point.forecast) for point in row.points) / len(row.points)
        )
        assert row.overall_error_percent == pytest.approx(
            100 * row.average_miss * len(actual) / sum(map(abs, actual))
        )
        first = row.points[0]
        changed = {
            week: value if week <= first.forecast_cutoff else value * 10
            for week, value in units.items()
        }
        rerun = backtest(start, len(weeks), set(weeks), changed, len(changed))
        assert rerun.horizons[horizon - 1].points[0].forecast == pytest.approx(first.forecast)

    insufficient = backtest(start, len(weeks), set(weeks[1:]), units, len(units))
    assert insufficient.status == "insufficient_history"
    assert insufficient.horizons == []


def test_error_percent_handles_zero_and_signed_units() -> None:
    assert error_metrics([0, 0], [2, 0]) == (1, None, 100)
    mae, wape, _ = error_metrics([-10, 10], [0, 5])
    assert (mae, wape) == (7.5, 75)
