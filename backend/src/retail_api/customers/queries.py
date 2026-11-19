from datetime import UTC, date, timedelta
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.engine import Connection, RowMapping

from retail_api.customers.definition import HORIZONS, POPULATION, TARGETS
from retail_api.customers.schema_v1 import model_runs, predictions
from retail_api.customers.schemas import (
    CohortFilters,
    CohortSummary,
    ForecastBin,
    HistoricalSpendPeriod,
    HouseholdPrediction,
    ModelEvidence,
    ModelType,
    PageFilters,
)
from retail_api.imports.schema_v1 import dataset_state, households, transactions
from retail_api.imports.schemas import Dataset


def source_versions(db: Connection) -> tuple[int, int]:
    dataset = dataset_state.c.dataset
    versions = {
        name: version
        for name, version in db.execute(
            sa.select(dataset, dataset_state.c.version).where(
                dataset.in_((Dataset.TRANSACTIONS, Dataset.HOUSEHOLDS))
            )
        )
    }
    return versions.get(Dataset.TRANSACTIONS, 0), versions.get(Dataset.HOUSEHOLDS, 0)


def latest_evidence(db: Connection, model: ModelType, versions: tuple[int, int]) -> ModelEvidence:
    row = (
        db.execute(
            sa.select(model_runs)
            .where(model_runs.c.model == model)
            .order_by(
                model_runs.c.as_of.desc(), model_runs.c.trained_at.desc(), model_runs.c.id.desc()
            )
            .limit(1)
        )
        .mappings()
        .first()
    )
    if row is None:
        return ModelEvidence(
            model=model,
            status="not_run",
            reason="No model evaluation has been published.",
            horizon_days=HORIZONS[model],
            target=TARGETS[model],
            population=POPULATION,
        )
    result = ModelEvidence.model_validate_json(row.evidence)
    if (row.transaction_version, row.household_version) != versions:
        return result.model_copy(
            update={
                "status": "stale",
                "reason": "Source data changed after this run. Refresh training to use scores.",
            }
        )
    return result


def cohort_predicates(version: UUID, filters: CohortFilters) -> list[Any]:
    return [
        predictions.c.run_id == version,
        *(
            predictions.c[name] == value
            for name in ("region", "loyalty_flag", "age_range", "household_size")
            if (value := getattr(filters, name)) is not None
        ),
    ]


def as_prediction(
    row: RowMapping, as_of: date, available: bool, threshold: float | None
) -> HouseholdPrediction:
    forecast = row.forecast if available else None
    return HouseholdPrediction.model_validate(
        {
            **row,
            "forecast": forecast,
            "recency_days": (as_of - row.last_purchase).days,
            "high_risk": forecast >= threshold
            if forecast is not None and threshold is not None
            else None,
        }
    )


def summary(
    db: Connection, evidence: ModelEvidence, filters: CohortFilters, threshold: float | None
) -> tuple[CohortSummary, dict[str, CohortSummary], list[ForecastBin]]:
    if evidence.version is None:
        return CohortSummary(), {}, []
    assert evidence.as_of is not None
    c = predictions.c
    available = evidence.status == "available"
    forecast = c.forecast
    columns = [
        sa.func.count().label("observed_households"),
        sa.func.count(sa.case((c.eligible == sa.true(), 1))).label("eligible_households"),
        sa.func.count(sa.case((c.eligible == sa.false(), 1))).label("inactive_180d"),
        sa.func.count(c.forecast).label("scored_households"),
        sa.func.avg(forecast).label("mean_future_spend"),
        sa.func.count(sa.case((c.forecast >= threshold, 1))).label("high_risk_households")
        if threshold is not None
        else sa.literal(0).label("high_risk_households"),
    ]
    predicates = cohort_predicates(evidence.version, filters)
    total = (
        db.execute(
            sa.select(
                *columns,
                sa.func.min(forecast).label("lowest"),
                sa.func.max(forecast).label("highest"),
            ).where(*predicates)
        )
        .mappings()
        .one()
    )
    groups = (
        db.execute(sa.select(c.region, *columns).where(*predicates).group_by(c.region))
        .mappings()
        .all()
    )

    def convert(row: RowMapping) -> CohortSummary:
        return CohortSummary(
            observed_households=row.observed_households,
            eligible_households=row.eligible_households,
            inactive_180d=row.inactive_180d
            if evidence.source_first_date
            and evidence.as_of
            and (evidence.as_of - evidence.source_first_date).days >= evidence.history_days - 1
            else None,
            scored_households=row.scored_households if available else 0,
            mean_future_spend=row.mean_future_spend if available and threshold is None else None,
            high_risk_households=row.high_risk_households
            if available and threshold is not None
            else None,
        )

    regions = {row.region: convert(row) for row in groups if row.region}
    bins = (
        distribution(
            db, predicates, evidence.model, total.lowest, total.highest, total.scored_households
        )
        if available and total.scored_households
        else []
    )
    return convert(total), regions, bins


def historical_spend(
    db: Connection, evidence: ModelEvidence, filters: CohortFilters
) -> list[HistoricalSpendPeriod]:
    if (
        evidence.status == "stale"
        or evidence.version is None
        or evidence.as_of is None
        or evidence.source_first_date is None
    ):
        return []

    days = HORIZONS[ModelType.CLV]
    count = min(4, ((evidence.as_of - evidence.source_first_date).days + 1) // days)
    if count <= 0:
        return []

    ends = [evidence.as_of - timedelta(days=days * offset) for offset in reversed(range(count))]
    periods = [(end - timedelta(days=days - 1), end) for end in ends]
    c = transactions.c
    # Region and other filters describe the households in the run's snapshot.
    # Include all recorded purchases and returns for those households.
    totals = db.execute(
        sa.select(
            *(
                sa.func.coalesce(
                    sa.func.sum(sa.case((c.purchase_date.between(start, end), c.spend), else_=0)),
                    0,
                )
                for start, end in periods
            )
        )
        .select_from(transactions.join(predictions, c.household_id == predictions.c.household_id))
        .where(
            *cohort_predicates(evidence.version, filters),
            c.purchase_date.between(periods[0][0], periods[-1][1]),
        )
    ).one()
    return [
        HistoricalSpendPeriod(start=start, end=end, net_spend=total)
        for (start, end), total in zip(periods, totals, strict=True)
    ]


def distribution(
    db: Connection,
    predicates: list[Any],
    model: ModelType,
    lowest: float,
    highest: float,
    total: int,
) -> list[ForecastBin]:
    if model is ModelType.CHURN:
        lowest, highest = 0.0, 1.0
    elif lowest == highest:
        return [ForecastBin(lower=lowest, upper=highest, count=total)]
    width = (highest - lowest) / 5
    edges = [lowest + index * width for index in range(5)] + [highest]
    forecast = predictions.c.forecast
    bucket = sa.case(
        *(
            (forecast < boundary, sa.literal_column(str(index)))
            for index, boundary in enumerate(edges[1:-1])
        ),
        else_=sa.literal_column("4"),
    ).label("bucket")
    scored = sa.select(bucket).where(*predicates, forecast.is_not(None)).subquery()
    counts = {
        index: count
        for index, count in db.execute(
            sa.select(scored.c.bucket, sa.func.count()).group_by(scored.c.bucket)
        )
    }
    return [
        ForecastBin(lower=edges[index], upper=edges[index + 1], count=counts.get(index, 0))
        for index in range(5)
    ]


def page(
    db: Connection, evidence: ModelEvidence, filters: PageFilters, threshold: float | None
) -> tuple[int, list[HouseholdPrediction]]:
    if evidence.version is None:
        return 0, []
    assert evidence.as_of is not None
    c = predictions.c
    available = evidence.status == "available"
    predicates = cohort_predicates(evidence.version, filters)
    total = db.scalar(sa.select(sa.func.count()).select_from(predictions).where(*predicates)) or 0
    order = [sa.case((c.forecast.is_(None), 1), else_=0), c.forecast.desc()] if available else []
    query = (
        sa.select(predictions)
        .where(*predicates)
        .order_by(*order, c.household_id)
        .offset((filters.page - 1) * filters.page_size)
        .limit(filters.page_size)
    )
    return total, [
        as_prediction(row, evidence.as_of, available, threshold)
        for row in db.execute(query).mappings()
    ]


def household(
    db: Connection, evidence: ModelEvidence, household_id: str, threshold: float | None
) -> HouseholdPrediction | None:
    if evidence.version is None:
        return None
    assert evidence.as_of is not None
    c = predictions.c
    row = (
        db.execute(
            sa.select(predictions).where(
                c.run_id == evidence.version, c.household_id == household_id
            )
        )
        .mappings()
        .one_or_none()
    )
    return (
        as_prediction(row, evidence.as_of, evidence.status == "available", threshold)
        if row
        else None
    )


def publish(
    db: Connection, evidence: ModelEvidence, rows: list[dict[str, Any]], artifact: str | None
) -> None:
    assert evidence.version and evidence.as_of and evidence.trained_at
    db.execute(
        model_runs.insert().values(
            id=evidence.version,
            model=evidence.model,
            as_of=evidence.as_of,
            trained_at=evidence.trained_at.astimezone(UTC).replace(tzinfo=None),
            transaction_version=evidence.transaction_version,
            household_version=evidence.household_version,
            evidence=evidence.model_dump_json(),
            artifact_uri=artifact,
        )
    )
    if rows:
        db.execute(predictions.insert(), rows)


def household_exists(db: Connection, household_id: str) -> bool:
    identifier = households.c.household_id
    return db.scalar(sa.select(identifier).where(identifier == household_id)) is not None
