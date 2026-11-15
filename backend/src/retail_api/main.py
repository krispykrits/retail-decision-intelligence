from typing import Literal

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from retail_api import __version__
from retail_api.config import Settings


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["retail-decision-intelligence"] = "retail-decision-intelligence"
    version: str = __version__


def create_app(settings: Settings | None = None) -> FastAPI:
    configuration = settings if settings is not None else Settings()
    application = FastAPI(
        title="Retail Decision Intelligence API",
        version=__version__,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        redoc_url=None,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.cors_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Authorization", "Content-Type"],
    )
    router = APIRouter(prefix="/api/v1")

    @router.get(
        "/health", response_model=HealthResponse, operation_id="get_health", tags=["health"]
    )
    def health() -> HealthResponse:
        """Process liveness only; database readiness is a separate concern."""
        return HealthResponse()

    application.include_router(router)
    return application


app = create_app()
