from typing import NoReturn

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
