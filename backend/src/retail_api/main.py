from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import NoReturn
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from retail_api import __version__
from retail_api.accounts.policy import CSRF_HEADER, authorize_request
from retail_api.api import API_PREFIX
from retail_api.api.account import router as account_router
from retail_api.api.health import router as health_router
from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.security import security_headers


def create_app(settings: Settings | None = None) -> FastAPI:
    configuration = settings if settings is not None else Settings()

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
        description=(
            "Health and account setup endpoints are public. Other versioned API endpoints require "
            "a verified account's session cookie. Writes require CSRF protection and, outside "
            "account flows, Administrator access. For Swagger writes, first call GET "
            "/api/v1/auth/csrf and enter its token under Authorize → CSRFToken; "
            "keep cookies enabled. "
            "Sign in through POST /api/v1/auth/login. Validation failures return 422 with field "
            "locations and safe messages, without echoing submitted credentials."
        ),
        openapi_tags=[
            {
                "name": "account",
                "description": (
                    "Registration, verified-email sign-in, recovery, sessions and SQL-managed"
                    " roles."
                ),
            },
            {"name": "health", "description": "Public process and database readiness probes."},
        ],
        version=__version__,
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    application.state.settings = configuration
    documentation_paths = {application.docs_url, application.swagger_ui_oauth2_redirect_url}

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        # Validation must not echo submitted passwords or recovery tokens.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {key: value for key, value in item.items() if key in {"loc", "msg", "type"}}
                    for item in error.errors()
                ]
            },
        )

    @application.middleware("http")
    async def request_policy(request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.correlation_id = str(uuid4())
        try:
            request.state.account = await authorize_request(request, configuration)
            response = await call_next(request)
        except HTTPException as error:
            response = JSONResponse(
                {"detail": error.detail}, status_code=error.status_code, headers=error.headers
            )
        except SQLAlchemyError:
            response = JSONResponse({"detail": "Account service unavailable"}, status_code=503)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        response.headers.update(
            security_headers(
                configuration.environment,
                documentation=request.url.path in documentation_paths,
            )
        )
        return response

    application.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", CSRF_HEADER],
    )
    application.include_router(health_router, prefix=API_PREFIX)
    application.include_router(account_router, prefix=API_PREFIX)
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
