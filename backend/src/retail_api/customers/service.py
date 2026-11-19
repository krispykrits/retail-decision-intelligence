from sqlalchemy.engine import Connection

from retail_api.customers import queries
from retail_api.customers.schemas import (
    RISK_THRESHOLD,
    CohortFilters,
    HouseholdPredictions,
    ModelEvidence,
    ModelSummary,
    ModelType,
    PageFilters,
    PredictionPage,
)


class HouseholdNotFound(LookupError):
    pass


class CustomerModels:
    def __init__(self, db: Connection) -> None:
        self.db = db
        self.versions = queries.source_versions(db)

    def source_changed(self) -> bool:
        return self.versions != queries.source_versions(self.db)

    def evidence(self, model: ModelType) -> ModelEvidence:
        return queries.latest_evidence(self.db, model, self.versions)

    def summary(
        self, model: ModelType, filters: CohortFilters, threshold: float | None = None
    ) -> ModelSummary:
        run = self.evidence(model)
        total, regions, distribution = queries.summary(self.db, run, filters, threshold)
        historical, segments = (
            queries.historical_spend(self.db, run, filters)
            if model is ModelType.CLV and total.observed_households
            else ([], [])
        )
        return ModelSummary(
            **total.model_dump(),
            evidence=run,
            regions=regions,
            risk_threshold=threshold,
            distribution=distribution,
            historical_spend=historical,
            observed_spend_segments=segments,
        )

    def page(
        self, model: ModelType, filters: PageFilters, threshold: float | None = None
    ) -> PredictionPage:
        run = self.evidence(model)
        total, rows = queries.page(self.db, run, filters, threshold)
        return PredictionPage(
            total=total, items=rows, evidence=run, page=filters.page, page_size=filters.page_size
        )

    def household_detail(self, hshd_num: str) -> HouseholdPredictions:
        if not queries.household_exists(self.db, hshd_num):
            raise HouseholdNotFound(hshd_num)
        clv = self.evidence(ModelType.CLV)
        churn = self.evidence(ModelType.CHURN)
        return HouseholdPredictions(
            household_id=hshd_num,
            clv=clv,
            churn=churn,
            future_spend=queries.household(self.db, clv, hshd_num, None),
            churn_risk=queries.household(self.db, churn, hshd_num, RISK_THRESHOLD),
        )
