from secrets import compare_digest

from fastapi import HTTPException, Request
from fastapi_users.authentication import CookieTransport
from itsdangerous import BadSignature, URLSafeTimedSerializer

from retail_api.accounts.models import AccountUser
from retail_api.accounts.store import NETWORK_ATTEMPT_LIMIT, SESSION_SECONDS, AccountStore
from retail_api.api import API_PREFIX
from retail_api.config import Environment, Settings

AUTH_PREFIX = f"{API_PREFIX}/auth"
CSRF_HEADER = "X-CSRF-Token"
CSRF_SECONDS = 60 * 60
READ_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
PUBLIC_READ_PATHS = frozenset(
    f"{API_PREFIX}/{path}"
    for path in ("health", "ready", "docs", "openapi.json", "auth/config", "auth/csrf")
)
PUBLIC_WRITE_PATHS = frozenset(
    f"{AUTH_PREFIX}/{path}"
    for path in (
        "register",
        "login",
        "request-verify",
        "verify",
        "forgot-password",
        "reset-password",
    )
)
LOGOUT_PATH = f"{AUTH_PREFIX}/logout"


def cookie_name(settings: Settings, purpose: str) -> str:
    prefix = "__Host-" if settings.environment is Environment.DEVELOPMENT else ""
    return f"{prefix}rdi_{purpose}"


def cookie_transport(settings: Settings) -> CookieTransport:
    return CookieTransport(
        cookie_name=cookie_name(settings, "session"),
        cookie_max_age=SESSION_SECONDS,
        cookie_secure=settings.environment is Environment.DEVELOPMENT,
        cookie_samesite="strict",
    )


def csrf_signer(settings: Settings) -> URLSafeTimedSerializer:
    if settings.auth_secret is None:
        raise HTTPException(503, "Account access is not configured")
    return URLSafeTimedSerializer(settings.auth_secret.get_secret_value(), salt="rdi-csrf")


def check_csrf(request: Request, settings: Settings) -> None:
    token = request.headers.get(CSRF_HEADER, "")
    cookie = request.cookies.get(cookie_name(settings, "csrf"), "")
    if not token or not cookie or not compare_digest(token, cookie):
        raise HTTPException(403, "Refresh the page and try again")
    origin = request.headers.get("Origin")
    allowed_origins = {settings.public_url.rstrip("/"), *settings.cors_origins}
    if origin is not None and origin not in allowed_origins:
        raise HTTPException(403, "Untrusted request origin")
    try:
        csrf_signer(settings).loads(token, max_age=CSRF_SECONDS)
    except BadSignature as error:
        raise HTTPException(403, "Refresh the page and try again") from error


async def authorize_request(request: Request, settings: Settings) -> AccountUser | None:
    path = request.url.path.rstrip("/")
    if not (path == API_PREFIX or path.startswith(f"{API_PREFIX}/")):
        return None
    if request.method in READ_METHODS and path in PUBLIC_READ_PATHS:
        return None
    if request.method == "OPTIONS":
        return None  # CORSMiddleware handles permitted preflights.
    if path in PUBLIC_WRITE_PATHS and request.method == "POST":
        check_csrf(request, settings)
        # Use the trusted connection address, never a client-supplied forwarded header.
        address = request.client.host if request.client else "unknown"
        await AccountStore(request.app.state.database).limit_attempts(
            f"network:{address}", NETWORK_ATTEMPT_LIMIT
        )
        return None
    token = request.cookies.get(cookie_name(settings, "session"))
    if not token:
        raise HTTPException(401, "Sign in required")
    user = await AccountStore(request.app.state.database).session_account(token)
    if user is None or not user.is_active or not user.is_verified:
        raise HTTPException(401, "Sign in required")
    if request.method not in READ_METHODS:
        check_csrf(request, settings)
        if path != LOGOUT_PATH and not user.is_superuser:
            raise HTTPException(403, "Administrator access required")
    return user
