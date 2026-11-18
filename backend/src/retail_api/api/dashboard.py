from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response

from retail_api.accounts.schemas import ErrorResponse
from retail_api.dashboard.schemas import (
    Breakdown,
    Dashboard,
    Dimension,
    FilterOptions,
    Filters,
    Grain,
    Metric,
    Signals,
    Summary,
    Trend,
)
from retail_api.dashboard.store import DashboardStore

router = APIRouter(
    prefix="/dashboard",
    tags=["Command Center"],
    responses={
        401: {"model": ErrorResponse, "description": "Sign in required"},
        503: {"model": ErrorResponse, "description": "Dashboard temporarily unavailable"},
    },
)
DashboardFilters = Annotated[Filters, Query()]


class TrendFilters(Filters):
    metric: Metric = "spend"
    grain: Grain | None = None


class BreakdownFilters(Filters):
    dimension: Dimension = "department"


def read_dashboard[T](
    request: Request, response: Response, filters: Filters, read: Callable[[DashboardStore, int], T]
) -> T:
    if filters.start and filters.end and filters.start > filters.end:
        raise HTTPException(422, "Start date must be on or before end date.")
    response.headers["Cache-Control"] = "no-store"
    with request.app.state.database.connect() as db:
        store = DashboardStore(db, filters)
        version = store.version
        result = read(store, version)
        if version != store.source_version():
            raise HTTPException(503, "The transactions changed while loading. Please retry.")
        return result


@router.get("/filter-options", summary="List dashboard filters and available transaction dates")
def filter_options(request: Request, response: Response) -> FilterOptions:
    return read_dashboard(request, response, Filters(), lambda store, _: store.options())


@router.get(
    "/summary",
    summary="Read current and prior retail KPIs",
    description=(
        "Includes the source revision, period coverage, observed cohorts and current trend buckets."
    ),
)
def summary(filters: DashboardFilters, request: Request, response: Response) -> Summary:
    return read_dashboard(
        request,
        response,
        filters,
        lambda store, version: store.summary(store.current_buckets()[1], version),
    )


@router.get(
    "/trends",
    summary="Read daily, weekly or monthly metric trends",
    description=(
        "Buckets contain observed rows only. Weeks are seven-day windows from each period start."
    ),
)
def trends(
    filters: Annotated[TrendFilters, Query()],
    request: Request,
    response: Response,
) -> Trend:
    def read(store: DashboardStore, _: int) -> Trend:
        grain, current = store.current_buckets(filters.grain)
        return store.trend(filters.metric, grain, current)

    return read_dashboard(request, response, filters, read)


@router.get(
    "/breakdown",
    summary="Rank net spend by department, commodity or region",
    description=(
        "Percentage shares are available when "
        "all groups are nonnegative and total spend is positive."
    ),
)
def breakdown(
    filters: Annotated[BreakdownFilters, Query()],
    request: Request,
    response: Response,
) -> Breakdown:
    return read_dashboard(
        request, response, filters, lambda store, _: store.breakdown(filters.dimension)
    )


@router.get(
    "/signals",
    summary="List observed changes with supporting counts and investigation links",
    description=(
        "Derived from comparable observed periods. "
        "No evaluated churn or forecast score is included."
    ),
)
def signals(filters: DashboardFilters, request: Request, response: Response) -> Signals:
    return read_dashboard(
        request,
        response,
        filters,
        lambda store, version: store.signals(store.summary([], version), store.breakdown()),
    )


@router.get("", summary="Load the Command Center for a single filter selection")
def dashboard(
    filters: Annotated[TrendFilters, Query()],
    request: Request,
    response: Response,
) -> Dashboard:
    def read(store: DashboardStore, version: int) -> Dashboard:
        grain, current = store.current_buckets(filters.grain)
        stats = store.summary(current, version)
        breakdown = store.breakdown()
        return Dashboard(
            options=store.options(),
            summary=stats,
            trend=store.trend(filters.metric, grain, current),
            breakdown=breakdown,
            signals=store.signals(stats, breakdown),
        )

    return read_dashboard(request, response, filters, read)
