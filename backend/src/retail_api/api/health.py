import logging
from typing import Literal

from alembic.script import ScriptDirectory
from azure.core.exceptions import AzureError
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from retail_api import __version__
from retail_api.migrate import MIGRATIONS

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)
expected_revision = ScriptDirectory(str(MIGRATIONS)).get_current_head()


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["retail-decision-intelligence"] = "retail-decision-intelligence"
    version: str = __version__


@router.get(
    "/health",
    response_model=HealthResponse,
    operation_id="get_health",
    summary="Check API process liveness",
)
def health() -> HealthResponse:
    """Public endpoint. Returns 200 while the API process can serve requests.

    Does not query SQL or check email delivery. Use /ready for database readiness.
    """
    return HealthResponse()


class ReadinessResponse(BaseModel):
    status: Literal["ready", "unavailable"]


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    responses={
        503: {
            "model": ReadinessResponse,
            "description": "SQL cannot be reached or migrations do not match the application.",
            "headers": {
                "Retry-After": {
                    "description": "Seconds to wait before retrying (15).",
                    "schema": {"type": "integer"},
                }
            },
        }
    },
    operation_id="get_readiness",
    summary="Check database and migration readiness",
)
def readiness(request: Request, response: Response) -> ReadinessResponse:
    """Public endpoint. Checks SQL connectivity and migration compatibility with this build.

    Returns 503 with a safe unavailable status and Retry-After: 15 otherwise. Responses are
    not cached and expose no database errors. Does not test email delivery.
    """
    response.headers["Cache-Control"] = "no-store"
    try:
        with request.app.state.database.connect() as connection:
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            if revision == expected_revision:
                return ReadinessResponse(status="ready")
    except (SQLAlchemyError, AzureError):
        # Exception text can contain server names, SQL parameters, or tokens.
        logger.warning("Database unavailable correlation_id=%s", request.state.correlation_id)
    response.status_code = 503
    response.headers["Retry-After"] = "15"
    return ReadinessResponse(status="unavailable")
