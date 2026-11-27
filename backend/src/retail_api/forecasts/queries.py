from datetime import UTC, date, timedelta
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from retail_api.forecasts.schema_v1 import accuracy_checks
from retail_api.forecasts.schemas import (
    AccuracyCheck,
    AccuracyEvidence,
    AccuracyResult,
    ForecastAccuracy,
    ObservedWeek,
    PurchaseCoverage,
)
from retail_api.imports.queries import transaction_product_versions
from retail_api.imports.schema_v1 import products, transactions

PURCHASE_DATE = transactions.c.purchase_date
REGION = transactions.c.store_region
COMMODITY = products.c.commodity
WEEK = timedelta(days=7)


def monday(value: date) -> date:
    return value - timedelta(days=value.weekday())


class DemandQueries:
    def __init__(self, db: Connection, commodity: str | None, region: str | None) -> None:
        self.db = db
        self.commodity = commodity
        self.region = region

    def bounds(self) -> tuple[date | None, date | None]:
        purchases = sa.select(PURCHASE_DATE).where(transactions.c.units > 0)
        if self.region:
            purchases = purchases.where(REGION == self.region)
        first = purchases.order_by(PURCHASE_DATE).limit(1).scalar_subquery()
        last = purchases.order_by(PURCHASE_DATE.desc()).limit(1).scalar_subquery()
        start, end = self.db.execute(sa.select(first, last)).one()
        return start, end

    def weekly_history(self) -> tuple[PurchaseCoverage, dict[date, int]]:
        first, last = self.bounds()
        coverage = PurchaseCoverage(
            first_purchase=first,
            last_purchase=last,
            first_complete_week=None,
            last_complete_week_end=None,
            complete_weeks=0,
            weeks_with_purchases=0,
        )
        if first is None or last is None:
            return coverage, {}

        start = monday(first)
        if start != first:
            start += WEEK
        end = monday(last) + timedelta(days=6)
        if end != last:
            end -= WEEK
        weeks = (end - start).days // 7 + 1
        if weeks <= 0:
            return coverage, {}
        coverage.first_complete_week = start
        coverage.last_complete_week_end = end
        coverage.complete_weeks = weeks

        totals: dict[date, int] = {}
        purchased: set[date] = set()
        if self.commodity:
            # Aggregate in SQL, returning at most one row per day and no transaction details.
            daily = (
                sa.select(
                    PURCHASE_DATE,
                    sa.func.sum(sa.cast(transactions.c.units, sa.BigInteger)),
                    sa.func.max(sa.case((transactions.c.units > 0, 1), else_=0)),
                )
                .select_from(transactions.join(products))
                .where(COMMODITY == self.commodity, PURCHASE_DATE.between(start, end))
                .group_by(PURCHASE_DATE)
            )
            if self.region:
                daily = daily.where(REGION == self.region)
            for day, units, has_purchase in self.db.execute(daily):
                week = monday(day)
                totals[week] = totals.get(week, 0) + units
                if has_purchase:
                    purchased.add(week)
        coverage.weeks_with_purchases = len(purchased)
        return coverage, totals

    def recorded_weeks(self, start: date, end: date) -> set[date]:
        query = sa.select(PURCHASE_DATE).where(PURCHASE_DATE.between(start, end)).distinct()
        if self.region:
            query = query.where(REGION == self.region)
        return {monday(day) for day in self.db.scalars(query)}


def accuracy_overview(
    db: Connection, commodity: str | None, region: str | None, check_id: UUID | None
) -> ForecastAccuracy:
    versions = transaction_product_versions(db)
    commodities = list(db.scalars(sa.select(COMMODITY).distinct().order_by(COMMODITY)))
    regions = list(db.scalars(sa.select(REGION).distinct().order_by(REGION)))
    if commodity is None:
        commodity = "PRODUCE" if "PRODUCE" in commodities else next(iter(commodities), None)
    elif commodity not in commodities:
        raise ValueError("Choose a recorded commodity.")
    if region is not None and region not in regions:
        raise ValueError("Choose a recorded region.")
    coverage, totals = DemandQueries(db, commodity, region).weekly_history()
    checks: list[AccuracyCheck] = []
    selected = None
    if commodity:
        columns = accuracy_checks.c
        scope = (
            columns.commodity == commodity,
            columns.region == (region or ""),
            columns.transaction_version == versions[0],
            columns.product_version == versions[1],
        )
        checks = [
            AccuracyCheck(
                id=row.id, checked_at=row.checked_at.replace(tzinfo=UTC), status=row.status
            )
            for row in db.execute(
                sa.select(columns.id, columns.checked_at, columns.status)
                .where(*scope)
                .order_by(columns.checked_at.desc(), columns.id.desc())
                .limit(50)
            )
        ]
        selected_id = check_id or next(
            (check.id for check in checks if check.status == "completed"), None
        )
        if selected_id:
            row = db.execute(
                sa.select(accuracy_checks).where(*scope, columns.id == selected_id)
            ).one_or_none()
            if row is not None:
                selected = AccuracyResult(
                    id=row.id,
                    checked_at=row.checked_at.replace(tzinfo=UTC),
                    status=row.status,
                    model_version=row.model_version,
                    transaction_version=row.transaction_version,
                    product_version=row.product_version,
                    evidence=AccuracyEvidence.model_validate_json(row.evidence),
                )
    if transaction_product_versions(db) != versions:
        raise RuntimeError("The purchase data changed while loading. Please retry.")
    return ForecastAccuracy(
        commodities=commodities,
        regions=regions,
        commodity=commodity,
        region=region,
        coverage=coverage,
        observed=[ObservedWeek(week_start=day, units=totals[day]) for day in sorted(totals)],
        checks=checks,
        selected=selected,
    )
