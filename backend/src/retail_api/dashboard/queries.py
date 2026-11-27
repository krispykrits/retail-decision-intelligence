"""Scoped Command Center reads. Each aggregate keeps its SQL date predicate seekable."""

from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.engine import Connection, Row
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import FromClause

from retail_api.dashboard.schemas import Dimension, Filters, Grain, Metric, Period
from retail_api.imports.queries import transaction_product_versions
from retail_api.imports.schema_v1 import households, products, transactions

METRICS: tuple[Metric, ...] = ("spend", "households", "baskets", "units", "avg_basket")
PURCHASE_DATE = transactions.c.purchase_date
IS_PURCHASE = transactions.c.units > 0
METRIC_COLUMNS: dict[Metric, tuple[str, ...]] = {
    "spend": ("spend",),
    "households": ("units", "household_id"),
    "baskets": ("basket_id",),
    "units": ("units",),
    "avg_basket": ("spend", "basket_id"),
}


def aggregates(
    source: FromClause = transactions, metrics: tuple[Metric, ...] = METRICS
) -> tuple[ColumnElement[Any], ...]:
    columns = source.c
    # Build expressions lazily because the trend query projects only the requested columns.
    fields: list[ColumnElement[Any]] = []
    if metrics == METRICS:
        fields.append(sa.func.count().label("lines"))
    if "spend" in metrics or "avg_basket" in metrics:
        fields.append(sa.func.sum(columns.spend).label("spend"))
    if "households" in metrics:
        fields.append(
            sa.func.count(sa.distinct(sa.case((columns.units > 0, columns.household_id)))).label(
                "households"
            )
        )
    if "baskets" in metrics or "avg_basket" in metrics:
        fields.append(sa.func.count(sa.distinct(columns.basket_id)).label("baskets"))
    if "units" in metrics:
        fields.append(sa.func.sum(sa.cast(columns.units, sa.BigInteger)).label("units"))
    return tuple(fields)


def month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


class DashboardQueries:
    def __init__(self, db: Connection, filters: Filters) -> None:
        self.db = db
        self.filters = filters

    def source(self) -> tuple[date | None, date | None, int, int]:
        # Independent first/last seeks use opposite ends of the existing date index.
        first = sa.select(PURCHASE_DATE).order_by(PURCHASE_DATE).limit(1).scalar_subquery()
        last = sa.select(PURCHASE_DATE).order_by(PURCHASE_DATE.desc()).limit(1).scalar_subquery()
        # Read the starting revisions before bounds on read-committed databases.
        versions = self.source_versions()
        start, end = self.db.execute(sa.select(first, last)).one()
        return start, end, *versions

    def source_versions(self) -> tuple[int, int]:
        return transaction_product_versions(self.db)

    def options(self) -> tuple[list[str], list[str]]:
        region = transactions.c.store_region
        department = products.c.department
        return (
            list(self.db.scalars(sa.select(region).distinct().order_by(region))),
            list(self.db.scalars(sa.select(department).distinct().order_by(department))),
        )

    def measures(
        self, current: Period | None, prior: Period | None
    ) -> tuple[Row[Any] | None, Row[Any] | None]:
        now, previous = self._pair(self._measure(current), self._measure(prior))
        return now[0] if now else None, previous[0] if previous else None

    def bucket_rows(
        self,
        current: Period | None,
        prior: Period | None,
        grain: Grain,
        metric: Metric | None = None,
    ) -> tuple[list[Row[Any]], list[Row[Any]]]:
        return self._pair(
            self._buckets(current, grain, metric), self._buckets(prior, grain, metric)
        )

    def group_rows(
        self, current: Period | None, prior: Period | None, dimension: Dimension
    ) -> tuple[list[Row[Any]], list[Row[Any]]]:
        return self._pair(self._grouping(current, dimension), self._grouping(prior, dimension))

    def _fetch(self, query: sa.Select[Any] | None) -> list[Row[Any]]:
        return list(self.db.execute(query)) if query is not None else []

    def _pair(
        self, current: sa.Select[Any] | None, prior: sa.Select[Any] | None
    ) -> tuple[list[Row[Any]], list[Row[Any]]]:
        if current is None:
            return [], self._fetch(prior)
        if prior is None:
            return self._fetch(current), []
        # A single round trip with independently optimized current and prior branches.
        query = sa.union_all(
            current.add_columns(sa.literal_column("0").label("period_index")),
            prior.add_columns(sa.literal_column("1").label("period_index")),
        )
        rows: tuple[list[Row[Any]], list[Row[Any]]] = ([], [])
        for row in self.db.execute(query):
            rows[row.period_index].append(row)
        return rows

    def _scoped(
        self, *columns: ColumnElement[Any], product_dimension: bool = False
    ) -> sa.Select[Any]:
        source = (
            transactions.join(products)
            if self.filters.department or product_dimension
            else transactions
        )
        query = sa.select(*columns).select_from(source)
        if self.filters.region:
            query = query.where(transactions.c.store_region == self.filters.region)
        if self.filters.department:
            query = query.where(products.c.department == self.filters.department)
        return query

    def _measure(self, period: Period | None) -> sa.Select[Any] | None:
        if period is None:
            return None
        return self._scoped(*aggregates()).where(PURCHASE_DATE.between(period.start, period.end))

    def _buckets(
        self, period: Period | None, grain: Grain, metric: Metric | None
    ) -> sa.Select[Any] | None:
        if period is None:
            return None
        metrics = METRICS if metric is None else (metric,)
        columns = dict.fromkeys(name for metric in metrics for name in METRIC_COLUMNS[metric])
        if grain == "month":
            if self.db.dialect.name == "mssql":
                month = sa.func.year(PURCHASE_DATE) * 12 + sa.func.month(PURCHASE_DATE) - 1
            else:
                month = (
                    sa.cast(sa.func.strftime("%Y", PURCHASE_DATE), sa.Integer) * 12
                    + sa.cast(sa.func.strftime("%m", PURCHASE_DATE), sa.Integer)
                    - 1
                )
            bucket = month - month_index(period.start)
        else:
            days: ColumnElement[Any]
            if self.db.dialect.name == "mssql":
                days = sa.func.datediff(
                    sa.literal_column("day"), sa.literal(period.start), PURCHASE_DATE
                )
            else:
                days = sa.func.julianday(PURCHASE_DATE) - sa.func.julianday(period.start)
            bucket = sa.cast(days / (7 if grain == "week" else 1), sa.Integer)

        lines = (
            self._scoped(
                bucket.label("bucket"),
                *(transactions.c[name] for name in columns),
            )
            .where(PURCHASE_DATE.between(period.start, period.end))
            .subquery()
        )
        return sa.select(lines.c.bucket, *aggregates(lines, metrics)).group_by(lines.c.bucket)

    def _grouping(self, period: Period | None, dimension: Dimension) -> sa.Select[Any] | None:
        if period is None:
            return None
        column = transactions.c.store_region if dimension == "region" else products.c[dimension]
        return (
            self._scoped(
                column.label("name"), *aggregates(), product_dimension=dimension != "region"
            )
            .where(PURCHASE_DATE.between(period.start, period.end))
            .group_by(column)
        )

    def shared_households(self, current: Period, prior: Period) -> int:
        household = transactions.c.household_id
        # The adjacent windows span a single continuous SQL date range.
        both = (
            self._scoped(household)
            .where(IS_PURCHASE, PURCHASE_DATE.between(prior.start, current.end))
            .group_by(household)
            .having(
                sa.func.min(PURCHASE_DATE) < current.start,
                sa.func.max(PURCHASE_DATE) >= current.start,
            )
            .subquery()
        )
        return self.db.scalar(sa.select(sa.func.count()).select_from(both)) or 0

    def last_purchase_counts(self, period: Period, cutoff: date) -> tuple[int, int]:
        # Seek backward on (household_id, purchase_date) for each known household.
        latest = (
            self._scoped(PURCHASE_DATE)
            .where(
                transactions.c.household_id == households.c.household_id,
                IS_PURCHASE,
                PURCHASE_DATE <= period.end,
            )
            .order_by(PURCHASE_DATE.desc())
            .limit(1)
            .correlate(households)
            .scalar_subquery()
        )
        last_purchases = sa.select(latest.label("last_purchase")).select_from(households).subquery()
        eligible, inactive = self.db.execute(
            sa.select(
                sa.func.count(last_purchases.c.last_purchase),
                sa.func.count(sa.case((last_purchases.c.last_purchase <= cutoff, 1))),
            ).select_from(last_purchases)
        ).one()
        return eligible, inactive
