"""Command Center period rules, metrics, and response assembly."""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.engine import Row

from retail_api.dashboard.queries import METRICS, DashboardQueries, month_index
from retail_api.dashboard.schemas import (
    Breakdown,
    Bucket,
    Change,
    Cohorts,
    Contribution,
    Dashboard,
    Dimension,
    Evidence,
    FilterOptions,
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

DEFAULT_DAYS = 90
INACTIVITY_DAYS = 180
DAY = timedelta(days=1)


def change(current: Decimal, previous: Decimal) -> Change:
    amount = current - previous
    # A signed spend/units baseline can be negative. Percent is meaningful only above zero.
    return Change(amount=amount, percent=amount / previous * 100 if previous > 0 else None)


def totals(row: Row[Any] | None) -> Totals | None:
    if row is None or not row.lines:
        return None
    return Totals(
        lines=row.lines,
        spend=row.spend,
        households=row.households,
        baskets=row.baskets,
        units=row.units,
        avg_basket=row.spend / row.baskets,
    )


def bucket_dates(period: Period, grain: Grain, index: int) -> tuple[date, date]:
    if grain == "month":
        year, month_offset = divmod(month_index(period.start) + index, 12)
        month = month_offset + 1
        return (
            max(period.start, date(year, month, 1)),
            min(period.end, date(year, month, monthrange(year, month)[1])),
        )
    width = 7 if grain == "week" else 1
    start = period.start + timedelta(days=index * width)
    end = date.fromordinal(min(period.end.toordinal(), start.toordinal() + width - 1))
    return start, end


class DashboardService:
    def __init__(self, queries: DashboardQueries) -> None:
        self.queries = queries
        self.filters = queries.filters
        self.first, self.last, self.version, self.product_version = queries.source()
        self.current, self.prior = self.periods()

    def source_changed(self) -> bool:
        return (self.version, self.product_version) != self.queries.source_versions()

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
        regions, departments = self.queries.options()
        return FilterOptions(
            first_date=self.first,
            last_date=self.last,
            regions=regions,
            departments=departments,
        )

    def comparable(self) -> bool:
        return bool(
            self.current and self.prior and not self.current.partial and not self.prior.partial
        )

    def cohorts(self, current: Totals, prior: Totals) -> Cohorts | None:
        if not self.comparable() or not self.current or not self.prior:
            return None
        shared = self.queries.shared_households(self.current, self.prior)
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
        eligible, inactive = self.queries.last_purchase_counts(period, date.fromordinal(cutoff))
        if not eligible:
            return None
        return Inactivity(
            days=INACTIVITY_DAYS, eligible=eligible, inactive=inactive, as_of=period.end
        )

    def measures(self) -> tuple[Totals | None, Totals | None]:
        current, prior = self.queries.measures(self.current, self.prior)
        return totals(current), totals(prior)

    def changes(self, current: Totals | None, prior: Totals | None) -> dict[Metric, Change]:
        if not current or not prior or not self.comparable():
            return {}
        return {
            metric: change(Decimal(getattr(current, metric)), Decimal(getattr(prior, metric)))
            for metric in METRICS
        }

    def summary(self, sparkline: list[Bucket] | None = None) -> Summary:
        if sparkline is None:
            grain = self.grain()
            rows, _ = self.queries.bucket_rows(self.current, None, grain)
            sparkline = self.sparkline(self.current, grain, rows)
        current, prior = self.measures()
        return Summary(
            current_period=self.current,
            prior_period=self.prior,
            current=current,
            prior=prior,
            changes=self.changes(current, prior),
            cohorts=self.cohorts(current, prior) if current and prior else None,
            inactivity=self.inactivity(),
            sparkline=sparkline,
            source_version=self.version,
        )

    def grain(self, requested: Grain | None = None) -> Grain:
        days = (self.current.end - self.current.start).days + 1 if self.current else 0
        return requested or ("day" if days <= 31 else "week" if days <= 180 else "month")

    def sparkline(self, period: Period | None, grain: Grain, rows: list[Row[Any]]) -> list[Bucket]:
        if period is None:
            return []
        buckets = []
        for row in sorted(rows, key=lambda row: row.bucket):
            stats = totals(row)
            assert stats is not None
            index = int(row.bucket)
            start, end = bucket_dates(period, grain, index)
            buckets.append(Bucket(index=index, start=start, end=end, totals=stats))
        return buckets

    def trend_points(
        self, period: Period | None, metric: Metric, grain: Grain, rows: list[Row[Any]]
    ) -> list[MetricPoint]:
        if period is None:
            return []
        points = []
        for row in sorted(rows, key=lambda row: row.bucket):
            index = int(row.bucket)
            start, end = bucket_dates(period, grain, index)
            value = row.spend / row.baskets if metric == "avg_basket" else row._mapping[metric]
            points.append(MetricPoint(index=index, start=start, end=end, value=value))
        return points

    def trend(self, metric: Metric, requested: Grain | None = None) -> Trend:
        grain = self.grain(requested)
        current, prior = self.queries.bucket_rows(self.current, self.prior, grain, metric)
        return self.build_trend(metric, grain, current, prior)

    def build_trend(
        self, metric: Metric, grain: Grain, current: list[Row[Any]], prior: list[Row[Any]]
    ) -> Trend:
        return Trend(
            metric=metric,
            grain=grain,
            current_period=self.current,
            prior_period=self.prior,
            current=self.trend_points(self.current, metric, grain, current),
            prior=self.trend_points(self.prior, metric, grain, prior),
        )

    def breakdown(self, dimension: Dimension | None = None) -> Breakdown:
        dimension = dimension or ("commodity" if self.filters.department else "department")
        current_rows, prior_rows = self.queries.group_rows(self.current, self.prior, dimension)
        current = {row.name: totals(row) for row in current_rows}
        prior = {row.name: totals(row) for row in prior_rows}
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

    def overview(self, metric: Metric, requested: Grain | None = None) -> Dashboard:
        grain = self.grain(requested)
        current, prior = self.queries.bucket_rows(self.current, self.prior, grain)
        summary = self.summary(self.sparkline(self.current, grain, current))
        breakdown = self.breakdown()
        return Dashboard(
            options=self.options(),
            summary=summary,
            trend=self.build_trend(metric, grain, current, prior),
            breakdown=breakdown,
            signals=self.build_signals(summary.current, summary.prior, breakdown),
        )

    def signals(self) -> Signals:
        if not self.comparable():
            return Signals(items=[])
        return self.build_signals(*self.measures())

    def build_signals(
        self, current: Totals | None, prior: Totals | None, breakdown: Breakdown | None = None
    ) -> Signals:
        if not current or not prior or not self.prior or not self.current or not self.comparable():
            return Signals(items=[])
        if breakdown is None:
            breakdown = self.breakdown()
        changes = self.changes(current, prior)
        route_filters = {
            "start": self.current.start.isoformat(),
            "end": self.current.end.isoformat(),
        }
        if self.filters.region:
            route_filters["region"] = self.filters.region
        if self.filters.department:
            route_filters["department"] = self.filters.department

        items = []
        area_filter = "commodity" if breakdown.dimension == "commodity" else "department"
        # A single area repeats the selection-wide change already shown in Key Takeaways.
        movers = sorted(
            (row for row in breakdown.rows if row.change is not None)
            if len(breakdown.rows) > 1
            else (),
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
                    route="/merchandise",
                    route_filters={**route_filters, area_filter: row.name, "metric": "spend"},
                    evidence=Evidence(
                        name=row.name,
                        current=row.current.spend,
                        prior=row.prior.spend,
                        current_lines=row.current.lines,
                        prior_lines=row.prior.lines,
                    ),
                    source_version=self.version,
                )
            )
        for metric in ("units", "households"):
            delta = changes.get(metric)
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
                    route="/baskets" if volume else "/customers",
                    route_filters={**route_filters, "metric": metric},
                    evidence=Evidence(
                        name=name,
                        current=getattr(current, metric),
                        prior=getattr(prior, metric),
                        current_lines=current.lines,
                        prior_lines=prior.lines,
                    ),
                    source_version=self.version,
                )
            )
        return Signals(items=items)
