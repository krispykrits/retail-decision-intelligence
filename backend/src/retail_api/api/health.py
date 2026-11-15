from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from retail_api import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["retail-decision-intelligence"] = "retail-decision-intelligence"
    version: str = __version__


@router.get("/health", response_model=HealthResponse, operation_id="get_health")
def health() -> HealthResponse:
    """Process liveness only; database readiness is a separate concern."""
    return HealthResponse()
