from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from retail_api.dashboard.schemas import Region

RISK_THRESHOLD = 0.5


class ModelType(StrEnum):
    CLV = "clv"
    CHURN = "churn"


class Metrics(BaseModel):
    mae: float | None = None
    rmse: float | None = None
    pr_auc: float | None = None
    roc_auc: float | None = None
    brier: float | None = None
    precision: float | None = None
    recall: float | None = None
    confusion: tuple[int, int, int, int] | None = Field(
        default=None, description="True negatives, false positives, false negatives, true positives"
    )
    calibration: list["CalibrationBin"] = Field(default_factory=list)


class CalibrationBin(BaseModel):
    count: int
    mean_probability: float
    observed_rate: float


class FoldEvidence(BaseModel):
    cutoff: date
    target_through: date
    training_rows: int
    validation_rows: int
    validation_households: int
    positive_rows: int | None = None
    candidate: Metrics
    baseline: Metrics


class Evaluation(BaseModel):
    eligible: bool
    reason: str
    baseline_name: str
    algorithm: str
    hyperparameters: dict[str, str | int | float | None] = Field(default_factory=dict)
    threshold: float | None
    training_first_cutoff: date | None
    training_last_cutoff: date | None
    training_rows: int
    training_households: int
    training_positive_rows: int | None
    validation_households: int
    validation_positive_rows: int | None
    primary_improvement_95_ci: tuple[float, float] | None
    candidate: Metrics | None
    baseline: Metrics | None
    folds: list[FoldEvidence]


class ModelEvidence(BaseModel):
    model: ModelType
    status: Literal["not_run", "unavailable", "stale", "available"]
    reason: str
    version: UUID | None = None
    as_of: date | None = None
    source_first_date: date | None = None
    source_last_date: date | None = None
    transaction_version: int | None = None
    household_version: int | None = None
    trained_at: datetime | None = None
    history_days: int = 180
    horizon_days: int
    target: str
    population: str
    caveats: list[str] = Field(default_factory=list)
    features: dict[str, str] = Field(default_factory=dict)
    evaluation: Evaluation | None = None


class CohortFilters(BaseModel):
    region: Region | None = None
    loyalty_flag: str | None = Field(default=None, max_length=1)
    age_range: str | None = Field(default=None, max_length=80)
    household_size: str | None = Field(default=None, max_length=80)


class ShoppingSegment(StrEnum):
    HIGHER_SPEND = "higher_spend"
    FREQUENT = "frequent"
    INFREQUENT = "infrequent"
    OTHER = "other"


class ClvFilters(CohortFilters):
    segment: ShoppingSegment | None = None


class PageFilters(CohortFilters):
    page: int = Field(default=1, ge=1, le=1_000_000)
    page_size: int = Field(default=25, ge=1, le=100)


class ClvPageFilters(PageFilters, ClvFilters):
    pass


class ChurnFilters(CohortFilters):
    risk_threshold: float = Field(
        default=RISK_THRESHOLD,
        ge=0,
        le=1,
        description="Probability used to flag high risk. Lower scoring rows remain visible.",
    )


class RetentionFilters(ChurnFilters):
    segment: ShoppingSegment | None = None


class ChurnPageFilters(PageFilters, ChurnFilters):
    pass


class CohortSummary(BaseModel):
    observed_households: int = 0
    eligible_households: int = 0
    inactive_180d: int | None = None
    scored_households: int = 0
    mean_future_spend: float | None = None
    high_risk_households: int | None = None


class ForecastBin(BaseModel):
    lower: float
    upper: float
    count: int


class HistoricalSpendPeriod(BaseModel):
    start: date
    end: date
    net_spend: Decimal


class ObservedSpendGroup(BaseModel):
    households: int
    net_spend: Decimal


class ObservedSpendSegment(ObservedSpendGroup):
    segment: ShoppingSegment


class ObservedSpendLoyalty(ObservedSpendGroup):
    loyalty_flag: str | None


class ModelSummary(CohortSummary):
    evidence: ModelEvidence
    risk_threshold: float | None = None
    regions: dict[str, CohortSummary] = Field(default_factory=dict)
    distribution: list[ForecastBin] = Field(default_factory=list)
    historical_spend: list[HistoricalSpendPeriod] = Field(
        default_factory=list,
        description="Observed net spend in complete 90-day periods for the CLV cohort.",
    )

    observed_spend_segments: list[ObservedSpendSegment] = Field(default_factory=list)
    observed_spend_by_loyalty: list[ObservedSpendLoyalty] = Field(default_factory=list)
    loyalty_filter: str | None = None


class HouseholdPrediction(BaseModel):
    household_id: str
    region: str | None
    loyalty_flag: str | None
    age_range: str | None
    household_size: str | None
    last_purchase: date
    recency_days: int
    purchase_days_180d: int
    observed_spend_180d: Decimal
    observed_spend_90d: Decimal | None = None
    eligible: bool
    forecast: float | None
    high_risk: bool | None = None


class PredictionPage(BaseModel):
    evidence: ModelEvidence
    total: int
    page: int
    page_size: int
    items: list[HouseholdPrediction]


class HouseholdPredictions(BaseModel):
    household_id: str
    clv: ModelEvidence
    churn: ModelEvidence
    future_spend: HouseholdPrediction | None
    churn_risk: HouseholdPrediction | None


class EngagementCounts(BaseModel):
    active: int = 0
    at_risk: int = 0
    inactive: int = 0
    no_purchase: int = 0


class EngagementPoint(EngagementCounts):
    date: date


class EngagementSegment(EngagementCounts):
    segment: ShoppingSegment


class RetentionHousehold(BaseModel):
    household_id: str
    segment: ShoppingSegment
    last_purchase: date | None
    recency_days: int | None
    purchase_days_180d: int
    net_spend_90d: Decimal
    churn_risk: float | None = None


class RetentionOverview(BaseModel):
    evidence: ModelEvidence
    as_of: date | None = None
    history_complete: bool = False
    households: list[RetentionHousehold]
    trend: list[EngagementPoint]
    segments: list[EngagementSegment]
    risk_threshold: float
