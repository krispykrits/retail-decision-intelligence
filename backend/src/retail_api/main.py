from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from retail_api import __version__
from retail_api.api.health import router as health_router
from retail_api.config import Settings


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
    application.include_router(health_router, prefix="/api/v1")
    return application


app = create_app()
