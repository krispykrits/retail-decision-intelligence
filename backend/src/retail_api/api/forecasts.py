from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response

from retail_api.accounts.schemas import ErrorResponse
from retail_api.forecasts.queries import accuracy_overview
from retail_api.forecasts.schemas import ForecastAccuracy

router = APIRouter(
    prefix="/forecasts",
    tags=["Forecast Studio"],
    responses={
        401: {"model": ErrorResponse, "description": "Sign in required"},
        503: {"model": ErrorResponse, "description": "Forecast accuracy temporarily unavailable"},
    },
)


@router.get(
    "/accuracy",
    summary="Read purchase history and saved accuracy checks",
    description=(
        "Filters by commodity and store region. Defaults to the latest completed check. "
        "A selected check includes paired actual, "
        "candidate and seasonal baseline values for all evaluated horizons. Only checks "
        "from the current transaction and product revisions are available."
    ),
)
def accuracy(
    request: Request,
    response: Response,
    commodity: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    region: Annotated[str | None, Query(min_length=1, max_length=7)] = None,
    check_id: UUID | None = None,
) -> ForecastAccuracy:
    response.headers["Cache-Control"] = "no-store"
    try:
        with request.app.state.database.connect() as db:
            return accuracy_overview(db, commodity, region, check_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
