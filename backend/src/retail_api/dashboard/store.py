from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy.engine import Connection, Row
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import FromClause

from retail_api.dashboard.schemas import (
    Breakdown,
    Bucket,
    Change,
    Cohorts,
    Contribution,
    Dimension,
    Evidence,
    FilterOptions,
    Filters,
    Grain,
    Inactivity,
    Metric,
    MetricPoint,
    Period,
    Signal,
    Signals,
    Summary,
    Totals,
    Trend,
)
from retail_api.imports.schema_v1 import dataset_state, products, transactions
from retail_api.imports.schemas import Dataset

DEFAULT_DAYS = 90
INACTIVITY_DAYS = 180
METRICS: tuple[Metric, ...] = ("spend", "households", "baskets", "units", "avg_basket")
DAY = timedelta(days=1)
PURCHASE_DATE = transactions.c.purchase_date
IS_PURCHASE = transactions.c.units > 0


def change(current: Decimal, previous: Decimal) -> Change:
    amount = current - previous
    # A signed spend/units baseline can be negative. Percent is meaningful only above zero.
    return Change(amount=amount, percent=amount / previous * 100 if previous > 0 else None)


def totals(row: Row[Any]) -> Totals | None:
    if not row.lines:
        return None
    return Totals(
        lines=row.lines,
        spend=row.spend,
        households=row.households,
        baskets=row.baskets,
        units=row.units,
        avg_basket=row.spend / row.baskets,
    )


def aggregates(source: FromClause = transactions) -> tuple[ColumnElement[Any], ...]:
    columns = source.c
    return (
        sa.func.count().label("lines"),
        sa.func.sum(columns.spend).label("spend"),
        sa.func.count(sa.distinct(sa.case((columns.units > 0, columns.household_id)))).label(
            "households"
        ),
        sa.func.count(sa.distinct(columns.basket_id)).label("baskets"),
        sa.func.sum(sa.cast(columns.units, sa.BigInteger)).label("units"),
    )


def month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def grain_for(period: Period | None) -> Grain:
    days = (period.end - period.start).days + 1 if period else 0
    if days <= 31:
        return "day"
    return "week" if days <= 180 else "month"


class DashboardStore:
    def __init__(self, db: Connection, filters: Filters) -> None:
        self.db = db
        self.filters = filters
        self.version = self.source_version()
        self.first: date | None
        self.last: date | None
        self.first, self.last = db.execute(
            sa.select(sa.func.min(PURCHASE_DATE), sa.func.max(PURCHASE_DATE))
        ).one()
        self.current, self.prior = self.periods()

    def period(self, start: date, end: date) -> Period:
        return Period(
            start=start,
            end=end,
            partial=self.first is None
            or self.last is None
            or start < self.first
            or end > self.last,
        )

    def periods(self) -> tuple[Period | None, Period | None]:
        if self.first is None or self.last is None:
            return None, None
        end = self.filters.end or max(self.last, self.filters.start or self.last)
        start = self.filters.start or date.fromordinal(
            max(min(self.first, end).toordinal(), end.toordinal() - DEFAULT_DAYS + 1)
        )
        current = self.period(start, end)
        prior_start = 2 * start.toordinal() - end.toordinal() - 1
        prior = self.period(date.fromordinal(prior_start), start - DAY) if prior_start > 0 else None
        return current, prior

    def options(self) -> FilterOptions:
        return FilterOptions(
            first_date=self.first,
            last_date=self.last,
            regions=list(
                self.db.scalars(
                    sa.select(transactions.c.store_region)
                    .distinct()
                    .order_by(transactions.c.store_region)
                )
            ),
            departments=list(
                self.db.scalars(
                    sa.select(products.c.department).distinct().order_by(products.c.department)
                )
            ),
        )

    def scoped(
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

    def measure(self, period: Period | None) -> Totals | None:
        if period is None:
            return None
        return totals(
            self.db.execute(
                self.scoped(*aggregates()).where(PURCHASE_DATE.between(period.start, period.end))
            ).one()
        )

    def buckets(self, period: Period | None, grain: Grain) -> list[Bucket]:
        if not period:
            return []
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
            self.scoped(
                bucket.label("bucket"),
                transactions.c.spend,
                transactions.c.units,
                transactions.c.basket_id,
                transactions.c.household_id,
            )
            .where(PURCHASE_DATE.between(period.start, period.end))
            .subquery()
        )
        query = (
            sa.select(lines.c.bucket, *aggregates(lines))
            .group_by(lines.c.bucket)
            .order_by(lines.c.bucket)
        )
        result = []
        for row in self.db.execute(query):
            stats = totals(row)
            assert stats is not None
            index = int(row.bucket)
            if grain == "month":
                year, month_offset = divmod(month_index(period.start) + index, 12)
                month_number = month_offset + 1
                start = max(period.start, date(year, month_number, 1))
                end = min(period.end, date(year, month_number, monthrange(year, month_number)[1]))
            else:
                width = 7 if grain == "week" else 1
                start = period.start + timedelta(days=index * width)
                end = date.fromordinal(min(period.end.toordinal(), start.toordinal() + width - 1))
            result.append(Bucket(index=index, start=start, end=end, totals=stats))
        return result

    def comparable(self) -> bool:
        return bool(
            self.current and self.prior and not self.current.partial and not self.prior.partial
        )

    def cohorts(self, current: Totals, prior: Totals) -> Cohorts | None:
        if not self.comparable() or not self.current or not self.prior:
            return None
        household = transactions.c.household_id
        # The adjacent windows span a single continuous SQL date range.
        both = (
            self.scoped(household)
            .where(IS_PURCHASE, PURCHASE_DATE.between(self.prior.start, self.current.end))
            .group_by(household)
            .having(
                sa.func.min(PURCHASE_DATE) < self.current.start,
                sa.func.max(PURCHASE_DATE) >= self.current.start,
            )
            .subquery()
        )
        shared = self.db.scalar(sa.select(sa.func.count()).select_from(both)) or 0
        return Cohorts(
            previous_active=prior.households,
            active_in_both=shared,
            active_only_in_current=current.households - shared,
            active_only_in_previous=prior.households - shared,
        )

    def inactivity(self) -> Inactivity | None:
        period = self.current
        if not period or period.partial or self.first is None:
            return None
        cutoff = period.end.toordinal() - INACTIVITY_DAYS
        if self.first.toordinal() > cutoff:
            return None
        household = transactions.c.household_id
        last_purchases = (
            self.scoped(sa.func.max(PURCHASE_DATE).label("last_purchase"))
            .where(IS_PURCHASE, PURCHASE_DATE <= period.end)
            .group_by(household)
            .subquery()
        )
        eligible, inactive = self.db.execute(
            sa.select(
                sa.func.count(),
                sa.func.count(
                    sa.case((last_purchases.c.last_purchase <= date.fromordinal(cutoff), 1))
                ),
            ).select_from(last_purchases)
        ).one()
        if not eligible:
            return None
        return Inactivity(
            days=INACTIVITY_DAYS, eligible=eligible, inactive=inactive, as_of=period.end
        )

    def source_version(self) -> int:
        return (
            self.db.scalar(
                sa.select(dataset_state.c.version).where(
                    dataset_state.c.dataset == Dataset.TRANSACTIONS
                )
            )
            or 0
        )

    def summary(self, sparkline: list[Bucket], version: int) -> Summary:
        current = self.measure(self.current)
        prior = self.measure(self.prior)
        comparable = current is not None and prior is not None and self.comparable()
        return Summary(
            current_period=self.current,
            prior_period=self.prior,
            current=current,
            prior=prior,
            changes={
                metric: change(Decimal(getattr(current, metric)), Decimal(getattr(prior, metric)))
                for metric in METRICS
            }
            if comparable
            else {},
            cohorts=self.cohorts(current, prior) if current and prior else None,
            inactivity=self.inactivity(),
            sparkline=sparkline,
            source_version=version,
        )

    def trend(self, metric: Metric, grain: Grain, current: list[Bucket]) -> Trend:
        def points(buckets: list[Bucket]) -> list[MetricPoint]:
            return [
                MetricPoint(
                    index=b.index, start=b.start, end=b.end, value=getattr(b.totals, metric)
                )
                for b in buckets
            ]

        return Trend(
            metric=metric,
            grain=grain,
            current_period=self.current,
            prior_period=self.prior,
            current=points(current),
            prior=points(self.buckets(self.prior, grain)),
        )

    def breakdown(self, dimension: Dimension) -> Breakdown:
        column = transactions.c.store_region if dimension == "region" else products.c[dimension]

        def grouping(period: Period | None) -> dict[str, Totals | None]:
            if period is None:
                return {}
            query = (
                self.scoped(
                    column.label("name"), *aggregates(), product_dimension=dimension != "region"
                )
                .where(PURCHASE_DATE.between(period.start, period.end))
                .group_by(column)
            )
            return {row.name: totals(row) for row in self.db.execute(query)}

        current = grouping(self.current)
        prior = grouping(self.prior)
        total = sum((row.spend for row in current.values() if row), Decimal(0))
        # A net mix with negative categories or nonpositive total is not a part-of-whole measure.
        show_share = total > 0 and all(row.spend >= 0 for row in current.values() if row)
        rows = []
        comparable = self.comparable()
        for name in current.keys() | prior.keys():
            value, previous = current.get(name), prior.get(name)
            rows.append(
                Contribution(
                    name=name,
                    current=value,
                    prior=previous,
                    change=change(value.spend, previous.spend)
                    if value and previous and comparable
                    else None,
                    share=value.spend / total * 100 if value and show_share else None,
                )
            )
        rows.sort(
            key=lambda row: (
                row.current is None,
                -(row.current.spend if row.current else 0),
                row.name,
            )
        )
        return Breakdown(
            dimension=dimension, current_period=self.current, prior_period=self.prior, rows=rows
        )

    def signals(self, summary: Summary, departments: Breakdown) -> Signals:
        current, prior = summary.current, summary.prior
        if not current or not prior or not self.prior or not self.current or not self.comparable():
            return Signals(items=[])
        route_filters = {
            "start": self.current.start.isoformat(),
            "end": self.current.end.isoformat(),
        }
        if self.filters.region:
            route_filters["region"] = self.filters.region
        if self.filters.department:
            route_filters["department"] = self.filters.department

        items = []
        movers = sorted(
            (row for row in departments.rows if row.change is not None),
            key=lambda row: (row.change.amount if row.change else Decimal(0), row.name),
        )
        for kind, ordered in (("decline", movers), ("growth", list(reversed(movers)))):
            if not ordered:
                break
            row = ordered[0]
            if not row.current or not row.prior or not row.change:
                continue
            down = kind == "decline"
            if (down and row.change.amount >= 0) or (not down and row.change.amount <= 0):
                continue
            items.append(
                Signal(
                    severity="watch" if down else "info",
                    type="decline" if down else "growth",
                    reason=f"Net spend {'fell' if down else 'rose'} in {row.name}.",
                    metric="spend",
                    delta=row.change,
                    comparison=self.prior,
                    route="/command-center",
                    route_filters={**route_filters, "department": row.name, "metric": "spend"},
                    evidence=Evidence(
                        name=row.name,
                        current=row.current.spend,
                        prior=row.prior.spend,
                        current_lines=row.current.lines,
                        prior_lines=row.prior.lines,
                    ),
                    source_version=summary.source_version,
                )
            )
        for metric in ("units", "households"):
            delta = summary.changes.get(metric)
            if delta is None or not delta.amount:
                continue
            volume = metric == "units"
            name = "Net units" if volume else "Active households"
            items.append(
                Signal(
                    severity="watch" if delta.amount < 0 else "info",
                    type="volume" if volume else "engagement",
                    reason=f"{name} {'fell' if delta.amount < 0 else 'rose'} across the selection.",
                    metric=metric,
                    delta=delta,
                    comparison=self.prior,
                    route="/command-center",
                    route_filters={**route_filters, "metric": metric},
                    evidence=Evidence(
                        name=name,
                        current=getattr(current, metric),
                        prior=getattr(prior, metric),
                        current_lines=current.lines,
                        prior_lines=prior.lines,
                    ),
                    source_version=summary.source_version,
                )
            )
        return Signals(items=items)
