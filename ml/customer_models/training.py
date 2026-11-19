"""Offline training and out-of-time validation. The serving process never loads an estimator."""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import numpy as np
from numpy.typing import NDArray
from sklearn.calibration import calibration_curve
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    mean_absolute_error,
    precision_score,
    recall_score,
    roc_auc_score,
    root_mean_squared_error,
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from ml.customer_models.features import History, Observation
from ml.customer_models.parameters import ClvParameters, ModelParameters, defaults
from retail_api.customers.definition import HISTORY_DAYS, HORIZONS
from retail_api.customers.schemas import (
    RISK_THRESHOLD,
    CalibrationBin,
    Evaluation,
    FoldEvidence,
    Metrics,
    ModelType,
)

MIN_HOUSEHOLDS = 50
MIN_CLASS_ROWS = 10
MAX_FOLDS = 3
TRAIN_STEP_DAYS = 30
RANDOM_SEED = 42
BASELINE = {
    ModelType.CLV: "Previous 90-day net spend",
    ModelType.CHURN: "Training churn prevalence",
}
ALGORITHM = {
    ModelType.CLV: "Histogram gradient boosting regression",
    ModelType.CHURN: "Standardized logistic regression",
}


@dataclass(frozen=True)
class Example:
    household_id: str
    observation: Observation
    target: float
    cutoff: date


@dataclass(frozen=True)
class HeldOut:
    fold: FoldEvidence
    ids: list[str]
    actual: NDArray[np.float64]
    prediction: NDArray[np.float64]
    baseline: NDArray[np.float64]


def examples(history: History, model: ModelType, cutoff: date) -> list[Example]:
    return [
        Example(household_id, observation, ledger.label(cutoff, model), cutoff)
        for household_id, ledger in history.ledgers.items()
        if (observation := ledger.observe(cutoff)) and observation.eligible
    ]


def training_examples(history: History, model: ModelType, cutoff: date) -> list[Example]:
    if history.first_date is None:
        return []
    # The final training label must end on or before this fold's forecast origin.
    first = history.first_date.toordinal() + HISTORY_DAYS - 1
    last = cutoff.toordinal() - HORIZONS[model]
    return [
        row
        for ordinal in range(first, last + 1, TRAIN_STEP_DAYS)
        for row in examples(history, model, date.fromordinal(ordinal))
    ]


def enough(rows: list[Example], model: ModelType) -> bool:
    if len({row.household_id for row in rows}) < MIN_HOUSEHOLDS:
        return False
    if model is ModelType.CHURN:
        positives = sum(row.target for row in rows)
        return min(positives, len(rows) - positives) >= MIN_CLASS_ROWS
    return True


def fit(rows: list[Example], parameters: ModelParameters) -> Any:
    estimator = (
        HistGradientBoostingRegressor(**parameters.model_dump(), early_stopping=False)
        if isinstance(parameters, ClvParameters)
        else make_pipeline(StandardScaler(), LogisticRegression(**parameters.model_dump()))
    )
    with threadpool_limits(limits=1):
        estimator.fit([row.observation.features for row in rows], [row.target for row in rows])
    return estimator


def scores(estimator: Any, rows: list[Observation], model: ModelType) -> NDArray[np.float64]:
    if not rows:
        return np.empty(0)
    features = [row.features for row in rows]
    with threadpool_limits(limits=1):
        values = (
            estimator.predict(features)
            if model is ModelType.CLV
            else estimator.predict_proba(features)[:, 1]
        )
    return np.asarray(values, dtype=np.float64)


def evaluate(
    model: ModelType, actual: NDArray[np.float64], predicted: NDArray[np.float64]
) -> Metrics:
    if model is ModelType.CLV:
        return Metrics(
            mae=mean_absolute_error(actual, predicted),
            rmse=root_mean_squared_error(actual, predicted),
        )
    labels = predicted >= RISK_THRESHOLD
    matrix = confusion_matrix(actual, labels, labels=[0, 1]).ravel()
    observed_rate, mean_probability = calibration_curve(actual, predicted, n_bins=5)
    # calibration_curve includes exact interval edges in the bin to their left.
    bins = np.searchsorted(np.linspace(0.0, 1.0, 6)[1:-1], predicted)
    counts = np.bincount(bins, minlength=5)
    return Metrics(
        pr_auc=average_precision_score(actual, predicted),
        roc_auc=roc_auc_score(actual, predicted),
        brier=brier_score_loss(actual, predicted),
        precision=precision_score(actual, labels, zero_division=0),
        recall=recall_score(actual, labels, zero_division=0),
        confusion=(int(matrix[0]), int(matrix[1]), int(matrix[2]), int(matrix[3])),
        calibration=[
            CalibrationBin(
                count=int(count), mean_probability=float(probability), observed_rate=float(rate)
            )
            for count, probability, rate in zip(
                counts[counts > 0], mean_probability, observed_rate, strict=True
            )
        ],
    )


def improvement(
    model: ModelType,
    actual: NDArray[np.float64],
    candidate: NDArray[np.float64],
    baseline: NDArray[np.float64],
) -> float:
    if model is ModelType.CLV:
        return float(mean_absolute_error(actual, baseline) - mean_absolute_error(actual, candidate))
    return float(
        average_precision_score(actual, candidate) - average_precision_score(actual, baseline)
    )


def confidence_interval(
    model: ModelType,
    ids: list[str],
    actual: NDArray[np.float64],
    candidate: NDArray[np.float64],
    baseline: NDArray[np.float64],
) -> tuple[float, float] | None:
    # Resample whole households so recurring observations across dates stay together.
    grouped: dict[str, list[int]] = {}
    for index, household_id in enumerate(ids):
        grouped.setdefault(household_id, []).append(index)
    clusters = tuple(grouped.values())
    generator = np.random.default_rng(RANDOM_SEED)
    estimates = []
    for _ in range(300):
        sampled = generator.integers(0, len(clusters), size=len(clusters))
        indices = [row for cluster in sampled for row in clusters[cluster]]
        truth = actual[indices]
        if model is ModelType.CHURN and len(np.unique(truth)) < 2:
            continue
        estimates.append(improvement(model, truth, candidate[indices], baseline[indices]))
    if not estimates:
        return None
    low, high = np.quantile(estimates, [0.025, 0.975])
    return float(low), float(high)


def backtests(
    history: History, model: ModelType, as_of: date, parameters: ModelParameters
) -> list[HeldOut]:
    if history.first_date is None:
        return []
    horizon = HORIZONS[model]
    minimum_cutoff = history.first_date.toordinal() + HISTORY_DAYS - 1
    records = []
    for offset in range(MAX_FOLDS, 0, -1):
        ordinal = as_of.toordinal() - offset * horizon
        if ordinal < minimum_cutoff:
            continue
        cutoff = date.fromordinal(ordinal)
        train = training_examples(history, model, cutoff)
        validation = examples(history, model, cutoff)
        if not enough(train, model) or not enough(validation, model):
            continue
        predicted = scores(fit(train, parameters), [row.observation for row in validation], model)
        actual = np.asarray([row.target for row in validation], dtype=np.float64)
        baseline = np.asarray(
            [row.observation.baseline_spend for row in validation]
            if model is ModelType.CLV
            else [sum(row.target for row in train) / len(train)] * len(validation),
            dtype=np.float64,
        )
        ids = [row.household_id for row in validation]
        records.append(
            HeldOut(
                FoldEvidence(
                    cutoff=cutoff,
                    target_through=cutoff + timedelta(days=horizon),
                    training_rows=len(train),
                    validation_rows=len(validation),
                    validation_households=len(set(ids)),
                    positive_rows=int(actual.sum()) if model is ModelType.CHURN else None,
                    candidate=evaluate(model, actual, predicted),
                    baseline=evaluate(model, actual, baseline),
                ),
                ids,
                actual,
                predicted,
                baseline,
            )
        )
    return records


def train_model(
    history: History, model: ModelType, cutoff: date, parameters: ModelParameters | None = None
) -> tuple[Evaluation, Any]:
    parameters = parameters or defaults(model)
    if isinstance(parameters, ClvParameters) != (model is ModelType.CLV):
        raise ValueError(f"Hyperparameters do not match the {model.value} estimator.")
    train = training_examples(history, model, cutoff)
    held_out = backtests(history, model, cutoff, parameters)
    ids = [household_id for record in held_out for household_id in record.ids]
    candidate = baseline = interval = None
    positive_rows = None
    eligible = False
    reason = "Fewer than two nonoverlapping holdouts with enough households and observed classes."
    if held_out:
        actual = np.concatenate([record.actual for record in held_out])
        prediction = np.concatenate([record.prediction for record in held_out])
        reference = np.concatenate([record.baseline for record in held_out])
        candidate = evaluate(model, actual, prediction)
        baseline = evaluate(model, actual, reference)
        interval = confidence_interval(model, ids, actual, prediction, reference)
        positive_rows = int(actual.sum()) if model is ModelType.CHURN else None
        if len(held_out) >= 2:
            if not enough(train, model):
                reason = "The final training window has too few eligible households or classes."
            else:
                secondary = (
                    candidate.rmse <= baseline.rmse
                    if candidate.rmse is not None and baseline.rmse is not None
                    else candidate.brier <= baseline.brier
                    if candidate.brier is not None and baseline.brier is not None
                    else False
                )
                eligible = interval is not None and interval[0] > 0 and secondary
                reason = (
                    "Held-out improvement cleared the primary and secondary baseline gates."
                    if eligible
                    else "The candidate did not clear the held-out baseline gates."
                )
    report = Evaluation(
        eligible=eligible,
        reason=reason,
        baseline_name=BASELINE[model],
        algorithm=ALGORITHM[model],
        hyperparameters=parameters.model_dump(),
        threshold=RISK_THRESHOLD if model is ModelType.CHURN else None,
        training_first_cutoff=train[0].cutoff if train else None,
        training_last_cutoff=train[-1].cutoff if train else None,
        training_rows=len(train),
        training_households=len({row.household_id for row in train}),
        training_positive_rows=int(sum(row.target for row in train))
        if model is ModelType.CHURN
        else None,
        validation_households=len(set(ids)),
        validation_positive_rows=positive_rows,
        primary_improvement_95_ci=interval,
        candidate=candidate,
        baseline=baseline,
        folds=[record.fold for record in held_out],
    )
    return report, fit(train, parameters) if eligible else None
