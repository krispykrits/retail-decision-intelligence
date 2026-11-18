"""Browser response policies for the application and Swagger documentation."""

from retail_api.config import Environment

HSTS_MAX_AGE_SECONDS = 31_536_000  # One year.
SWAGGER_CDN_ORIGIN = "https://cdn.jsdelivr.net"
SWAGGER_ICON_ORIGIN = "https://fastapi.tiangolo.com"

COMMON_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

APPLICATION_CSP = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; "
    "frame-ancestors 'none'; form-action 'self'"
)
# FastAPI's Swagger page requires its CDN assets and inline bootstrap script.
SWAGGER_CSP = (
    f"{APPLICATION_CSP}; script-src {SWAGGER_CDN_ORIGIN} 'unsafe-inline'; "
    f"style-src {SWAGGER_CDN_ORIGIN} 'unsafe-inline'; "
    f"img-src 'self' {SWAGGER_ICON_ORIGIN} data:"
)


def security_headers(
    environment: Environment, *, documentation: bool, import_storage_account: str | None = None
) -> dict[str, str]:
    headers = COMMON_SECURITY_HEADERS.copy()
    if environment is Environment.DEVELOPMENT:
        headers["Strict-Transport-Security"] = f"max-age={HSTS_MAX_AGE_SECONDS}"
        headers["Content-Security-Policy"] = SWAGGER_CSP if documentation else APPLICATION_CSP
        if import_storage_account:
            headers["Content-Security-Policy"] += (
                f"; connect-src 'self' https://{import_storage_account}.blob.core.windows.net"
            )
    return headers
