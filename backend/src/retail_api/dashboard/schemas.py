from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

Metric = Literal["spend", "households", "baskets", "units", "avg_basket"]
Grain = Literal["day", "week", "month"]
Dimension = Literal["department", "commodity", "region"]
Region = Literal["EAST", "CENTRAL", "WEST", "SOUTH"]


class Filters(BaseModel):
    start: date | None = None
    end: date | None = None
    region: Region | None = None
    department: str | None = Field(default=None, min_length=1, max_length=80)


class Period(BaseModel):
    start: date
    end: date
    partial: bool


class FilterOptions(BaseModel):
    first_date: date | None
    last_date: date | None
    regions: list[str]
    departments: list[str]


class Totals(BaseModel):
    lines: int
    spend: Decimal
    households: int
    baskets: int
    units: int
    avg_basket: Decimal


class Bucket(BaseModel):
    start: date
    end: date
    index: int
    totals: Totals


class MetricPoint(BaseModel):
    start: date
    end: date
    index: int
    value: Decimal


class Change(BaseModel):
    amount: Decimal
    percent: Decimal | None


class Cohorts(BaseModel):
    previous_active: int
    active_in_both: int
    active_only_in_current: int
    active_only_in_previous: int


class Inactivity(BaseModel):
    days: int
    eligible: int
    inactive: int
    as_of: date


class Summary(BaseModel):
    current_period: Period | None
    prior_period: Period | None
    current: Totals | None
    prior: Totals | None
    changes: dict[Metric, Change]
    cohorts: Cohorts | None
    inactivity: Inactivity | None
    sparkline: list[Bucket]
    source_version: int


class Trend(BaseModel):
    metric: Metric
    grain: Grain
    current_period: Period | None
    prior_period: Period | None
    current: list[MetricPoint]
    prior: list[MetricPoint]


class Contribution(BaseModel):
    name: str
    current: Totals | None
    prior: Totals | None
    change: Change | None
    share: Decimal | None


class Breakdown(BaseModel):
    dimension: Dimension
    current_period: Period | None
    prior_period: Period | None
    rows: list[Contribution]


class Evidence(BaseModel):
    name: str
    current: Decimal
    prior: Decimal
    current_lines: int
    prior_lines: int


class Signal(BaseModel):
    severity: Literal["watch", "info"]
    type: Literal["decline", "growth", "volume", "engagement"]
    reason: str
    metric: Metric
    delta: Change
    comparison: Period
    route: str
    route_filters: dict[str, str]
    evidence: Evidence
    source_version: int


class Signals(BaseModel):
    items: list[Signal]


class Dashboard(BaseModel):
    options: FilterOptions
    summary: Summary
    trend: Trend
    breakdown: Breakdown
    signals: Signals
