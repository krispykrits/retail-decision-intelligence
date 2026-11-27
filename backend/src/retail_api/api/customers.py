from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response

from retail_api.accounts.schemas import ErrorResponse
from retail_api.customers import service
from retail_api.customers.schemas import (
    ChurnFilters,
    ChurnPageFilters,
    ClvFilters,
    ClvPageFilters,
    HouseholdPredictions,
    ModelEvidence,
    ModelSummary,
    ModelType,
    PredictionPage,
)

router = APIRouter(
    prefix="/customers",
    tags=["Customer Models"],
    responses={
        401: {"model": ErrorResponse, "description": "Sign in required"},
        503: {"model": ErrorResponse, "description": "Customer models temporarily unavailable"},
    },
)


def read_connection(request: Request, response: Response) -> Iterator[service.CustomerModels]:
    response.headers["Cache-Control"] = "no-store"
    with request.app.state.database.connect() as db:
        models = service.CustomerModels(db)
        yield models
        if models.source_changed():
            raise HTTPException(503, "Source data changed while loading. Please retry.")


Models = Annotated[service.CustomerModels, Depends(read_connection, scope="function")]


@router.get("/clv/summary", summary="Summarize modeled 90-day net spend for a cohort")
def clv_summary(models: Models, filters: Annotated[ClvFilters, Query()]) -> ModelSummary:
    return models.summary(ModelType.CLV, filters)


@router.get("/clv/households", summary="Rank households by validated 90-day net spend")
def clv_households(models: Models, filters: Annotated[ClvPageFilters, Query()]) -> PredictionPage:
    return models.page(ModelType.CLV, filters)


@router.get("/churn/summary", summary="Summarize observed inactivity and modeled 60-day risk")
def churn_summary(models: Models, filters: Annotated[ChurnFilters, Query()]) -> ModelSummary:
    return models.summary(ModelType.CHURN, filters, filters.risk_threshold)


@router.get("/churn/households", summary="Rank households by validated 60-day churn probability")
def churn_households(
    models: Models, filters: Annotated[ChurnPageFilters, Query()]
) -> PredictionPage:
    return models.page(ModelType.CHURN, filters, filters.risk_threshold)


@router.get("/models/{model}/evaluation", summary="Read versioned out-of-time model evidence")
def evaluation(models: Models, model: ModelType) -> ModelEvidence:
    return models.evidence(model)


@router.get(
    "/{hshd_num}/predictions",
    summary="Read published predictions for a pseudonymous household ID",
    responses={404: {"model": ErrorResponse, "description": "Household not found"}},
)
def household_predictions(
    models: Models,
    hshd_num: Annotated[str, Path(min_length=1, max_length=32, pattern=r"^[0-9]+$")],
) -> HouseholdPredictions:
    try:
        return models.household_detail(hshd_num)
    except service.HouseholdNotFound as error:
        raise HTTPException(404, "Household not found") from error
