from collections.abc import Sequence
from datetime import date, timedelta
from math import cos, isfinite, sin, tau
from statistics import mean

from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from retail_api.forecasts.queries import WEEK
from retail_api.forecasts.schemas import AccuracyEvidence, AccuracyPoint, HorizonAccuracy

MODEL_VERSION = "ridge-lag-v1"
HORIZONS = range(1, 5)
LAG_WEEKS = 4
SEASONAL_LAG = 52
MIN_TEST_WEEKS = 12
MAX_TEST_WEEKS = 26


def features(
    units: Sequence[int], origin: int, target_week: date
) -> tuple[float, float, float, float]:
    season = tau * (target_week.isocalendar().week - 1) / SEASONAL_LAG
    return units[origin], mean(units[origin - LAG_WEEKS + 1 : origin + 1]), sin(season), cos(season)


def error_metrics(
    actual: Sequence[int], forecast: Sequence[float]
) -> tuple[float, float | None, float]:
    pairs = list(zip(actual, forecast, strict=True))
    errors = [abs(observed - predicted) for observed, predicted in pairs]
    total = sum(map(abs, actual))
    wape = 100 * sum(errors) / total if total else None
    smape = mean(
        200 * error / (abs(observed) + abs(predicted)) if observed or predicted else 0
        for (observed, predicted), error in zip(pairs, errors, strict=True)
    )
    return mean(errors), wape, smape


def evaluate_horizon(
    start: date, units: Sequence[int], horizon: int, first_target: int
) -> HorizonAccuracy:
    weeks = [start + index * WEEK for index in range(len(units))]
    first_training_target = LAG_WEEKS - 1 + horizon
    rows = {
        target: features(units, target - horizon, weeks[target])
        for target in range(first_training_target, len(units))
    }
    points: list[AccuracyPoint] = []
    for target in range(first_target, len(units)):
        origin = target - horizon
        # Every training outcome ends by the forecast cutoff, including at longer horizons.
        training = [rows[index] for index in range(first_training_target, origin + 1)]
        model = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
        model.fit(training, units[first_training_target : origin + 1])
        forecast = float(model.predict([rows[target]])[0])
        if not isfinite(forecast):
            raise ArithmeticError("Non-finite weekly prediction")
        points.append(
            AccuracyPoint(
                week_start=weeks[target],
                forecast_cutoff=weeks[origin] + timedelta(days=6),
                actual=units[target],
                forecast=forecast,
                baseline=units[target - SEASONAL_LAG],
            )
        )
    actual = [point.actual for point in points]
    mae, wape, smape = error_metrics(actual, [point.forecast for point in points])
    naive_mae, naive_wape, naive_smape = error_metrics(actual, [point.baseline for point in points])
    return HorizonAccuracy(
        horizon=horizon,
        average_miss=mae,
        baseline_average_miss=naive_mae,
        overall_error_percent=wape,
        baseline_overall_error_percent=naive_wape,
        symmetric_error_percent=smape,
        baseline_symmetric_error_percent=naive_smape,
        weeks_tested=len(points),
        first_training_week=weeks[0],
        last_training_week_end=points[-1].forecast_cutoff,
        training_samples_min=first_target - horizon - first_training_target + 1,
        training_samples_max=len(units) - horizon - first_training_target,
        points=points,
    )


def backtest(
    start: date | None,
    weeks: int,
    recorded: set[date],
    units_by_week: dict[date, int],
    weeks_with_purchases: int,
) -> AccuracyEvidence:
    if start is None or weeks < SEASONAL_LAG + MIN_TEST_WEEKS:
        return AccuracyEvidence(
            status="insufficient_history",
            reason=f"At least {SEASONAL_LAG + MIN_TEST_WEEKS} complete weeks are needed.",
        )
    if weeks_with_purchases < SEASONAL_LAG:
        return AccuracyEvidence(
            status="insufficient_history",
            reason=f"At least {SEASONAL_LAG} weeks with purchases for this commodity are needed.",
        )
    dates = [start + index * WEEK for index in range(weeks)]
    if any(week not in recorded for week in dates):
        return AccuracyEvidence(
            status="insufficient_history",
            reason="Some weeks have no recorded activity for this region.",
        )
    # Within recorded weeks, no commodity transactions means zero recorded net units.
    units = [units_by_week.get(week, 0) for week in dates]
    first_target = max(SEASONAL_LAG, weeks - MAX_TEST_WEEKS)
    with threadpool_limits(limits=1):
        horizons = [evaluate_horizon(start, units, horizon, first_target) for horizon in HORIZONS]
    return AccuracyEvidence(
        status="completed",
        reason="Both forecasts were compared against the same recorded weeks.",
        horizons=horizons,
    )
