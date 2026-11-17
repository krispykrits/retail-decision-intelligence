from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import NoReturn
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from retail_api import __version__
from retail_api.api.health import router as health_router
from retail_api.config import Settings
from retail_api.database import create_database_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    configuration = settings if settings is not None else Settings()
    development = configuration.environment == "development"

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        engine = create_database_engine(configuration)
        application.state.database = engine
        try:
            yield
        finally:
            engine.dispose()

    application = FastAPI(
        title="Retail Decision Intelligence API",
        version=__version__,
        openapi_url=None if development else "/api/v1/openapi.json",
        docs_url=None if development else "/api/v1/docs",
        redoc_url=None,
        lifespan=lifespan,
    )

    @application.middleware("http")
    async def correlation_id(request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.correlation_id = str(uuid4())
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if development:
            # The Azure ingress enforces HTTPS; the built SPA needs only same-origin assets.
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; base-uri 'self'; object-src 'none'; "
                "frame-ancestors 'none'; form-action 'self'"
            )
        return response

    application.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.cors_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Authorization", "Content-Type"],
    )
    application.include_router(health_router, prefix="/api/v1")
    if configuration.static_directory is not None:
        # Unknown API requests must never fall through to the React HTML page.
        application.add_api_route(
            "/api/{path:path}",
            api_not_found,
            methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            include_in_schema=False,
            response_model=None,
        )
        application.frontend(
            "/", directory=configuration.static_directory, fallback="index.html", check_dir=True
        )
        application.mount(
            "/assets",
            StaticFiles(directory=configuration.static_directory / "assets"),
            name="assets",
        )
    return application


def api_not_found() -> NoReturn:
    raise HTTPException(status_code=404, detail="Not Found")


app = create_app()
