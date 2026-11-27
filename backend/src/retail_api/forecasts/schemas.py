from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

CheckStatus = Literal["completed", "insufficient_history", "failed"]


class PurchaseCoverage(BaseModel):
    first_purchase: date | None
    last_purchase: date | None
    first_complete_week: date | None
    last_complete_week_end: date | None
    complete_weeks: int
    weeks_with_purchases: int


class ObservedWeek(BaseModel):
    week_start: date
    units: int


class AccuracyPoint(BaseModel):
    week_start: date
    forecast_cutoff: date
    actual: int
    forecast: float
    baseline: int


class HorizonAccuracy(BaseModel):
    horizon: int
    average_miss: float
    baseline_average_miss: float
    overall_error_percent: float | None
    baseline_overall_error_percent: float | None
    symmetric_error_percent: float
    baseline_symmetric_error_percent: float
    weeks_tested: int
    first_training_week: date
    last_training_week_end: date
    training_samples_min: int
    training_samples_max: int
    points: list[AccuracyPoint]


class AccuracyEvidence(BaseModel):
    status: CheckStatus
    reason: str
    horizons: list[HorizonAccuracy] = Field(default_factory=list)


class AccuracyCheck(BaseModel):
    id: UUID
    checked_at: datetime
    status: CheckStatus


class AccuracyResult(AccuracyCheck):
    model_version: str
    transaction_version: int
    product_version: int
    evidence: AccuracyEvidence


class ForecastAccuracy(BaseModel):
    commodities: list[str]
    regions: list[str]
    commodity: str | None
    region: str | None
    coverage: PurchaseCoverage
    observed: list[ObservedWeek]
    checks: list[AccuracyCheck]
    selected: AccuracyResult | None
