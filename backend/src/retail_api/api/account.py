import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import APIKeyCookie, APIKeyHeader, OAuth2PasswordRequestForm
from fastapi_users import exceptions

from retail_api.accounts.manager import AccountManager, ManagedAccountCreate
from retail_api.accounts.policy import (
    CSRF_HEADER,
    CSRF_SECONDS,
    cookie_name,
    cookie_transport,
    csrf_signer,
)
from retail_api.accounts.schemas import (
    AccountRead,
    Credentials,
    CsrfToken,
    EmailRequest,
    ErrorResponse,
    LinkToken,
    RegisterAccount,
    ResetPassword,
)
from retail_api.accounts.store import AccountStore
from retail_api.config import Environment, Settings

router = APIRouter(tags=["account"])
csrf_documentation = [
    Depends(
        APIKeyHeader(
            name=CSRF_HEADER,
            scheme_name="CSRFToken",
            auto_error=False,
            description="CSRF token returned by GET /api/v1/auth/csrf; required on writes.",
        )
    )
]
session_documentation = [
    Depends(APIKeyCookie(name="rdi_session", scheme_name="LocalSession", auto_error=False)),
    Depends(
        APIKeyCookie(name="__Host-rdi_session", scheme_name="DevelopmentSession", auto_error=False)
    ),
]
cookie_write_security: dict[str, Any] = {
    "security": [
        {"LocalSession": [], "CSRFToken": []},
        {"DevelopmentSession": [], "CSRFToken": []},
    ]
}
SERVICE_ERRORS: dict[int | str, dict[str, Any]] = {
    503: {
        "model": ErrorResponse,
        "description": "Account configuration, SQL or email delivery unavailable.",
    },
}
SESSION_ERRORS: dict[int | str, dict[str, Any]] = {
    **SERVICE_ERRORS,
    401: {"model": ErrorResponse, "description": "Missing, invalid, expired or revoked session."},
}
WRITE_ERRORS: dict[int | str, dict[str, Any]] = {
    **SERVICE_ERRORS,
    403: {"model": ErrorResponse, "description": "Invalid CSRF token or request origin."},
}
PUBLIC_ACCOUNT_ERRORS: dict[int | str, dict[str, Any]] = {
    **WRITE_ERRORS,
    429: {"model": ErrorResponse, "description": "Too many account requests; retry later."},
}


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_manager(request: Request) -> AccountManager:
    return AccountManager(AccountStore(request.app.state.database), get_settings(request))


Manager = Annotated[AccountManager, Depends(get_manager)]


def require_mail(manager: AccountManager) -> None:
    if manager.settings.mail is None:
        raise HTTPException(503, "Account email delivery is not configured")


@router.get(
    "/auth/csrf",
    operation_id="get_csrf_token",
    summary="Get a CSRF token and cookie",
    responses=SERVICE_ERRORS,
)
def csrf(request: Request, response: Response) -> CsrfToken:
    """Public. Sets the CSRF cookie; send the returned token as X-CSRF-Token on writes.
    In Swagger, enter the token under Authorize. Expires after one hour."""
    settings = get_settings(request)
    token = csrf_signer(settings).dumps(secrets.token_urlsafe(32))
    response.set_cookie(
        cookie_name(settings, "csrf"),
        token,
        max_age=CSRF_SECONDS,
        secure=settings.environment is Environment.DEVELOPMENT,
        httponly=True,
        samesite="strict",
    )
    response.headers["Cache-Control"] = "no-store"
    return CsrfToken(token=token)


@router.post(
    "/auth/register",
    status_code=202,
    operation_id="register_account",
    dependencies=csrf_documentation,
    summary="Register an Analyst account",
    responses=PUBLIC_ACCOUNT_ERRORS,
)
async def register(data: RegisterAccount, request: Request, manager: Manager) -> None:
    """Public with CSRF. Creates an unverified Analyst and emails a verification link.
    Existing accounts also return 202. Verification is required before sign-in."""
    require_mail(manager)
    try:
        await manager.create(ManagedAccountCreate(**data.model_dump()), safe=True, request=request)
    except exceptions.UserAlreadyExists:
        return None


@router.post(
    "/auth/login",
    status_code=204,
    operation_id="sign_in",
    dependencies=csrf_documentation,
    summary="Sign in with email and password",
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        401: {
            "model": ErrorResponse,
            "description": "Invalid credentials or unverified/inactive account.",
        },
    },
)
async def login(data: Credentials, request: Request, manager: Manager) -> Response:
    """Public with CSRF. Signs in a verified account and issues an eight-hour HttpOnly session.
    The cookie is Secure in development; an existing browser session is replaced."""
    await AccountStore(request.app.state.database).limit_attempts(
        f"login:{str(data.email).casefold()}"
    )
    credentials = OAuth2PasswordRequestForm(username=str(data.email), password=data.password)
    user = await manager.authenticate(credentials)
    if user is None or not user.is_active or (not user.is_verified):
        raise HTTPException(
            401, "Check your email and password, and verify your email before signing in"
        )
    store = AccountStore(request.app.state.database)
    token = secrets.token_urlsafe(32)
    await store.add_session(user, token)
    previous = request.cookies.get(cookie_name(manager.settings, "session"))
    if previous:
        await store.remove_session(previous)
    return await cookie_transport(manager.settings).get_login_response(token)


@router.post(
    "/auth/logout",
    status_code=204,
    operation_id="sign_out",
    summary="Revoke the current session",
    openapi_extra=cookie_write_security,
    responses={**SESSION_ERRORS, **WRITE_ERRORS},
)
async def logout(request: Request) -> Response:
    """Requires a session and CSRF. Revokes this session in SQL and clears its cookie."""
    settings = get_settings(request)
    await AccountStore(request.app.state.database).remove_session(
        request.cookies[cookie_name(settings, "session")]
    )
    return await cookie_transport(settings).get_logout_response()


@router.post(
    "/auth/request-verify",
    status_code=202,
    operation_id="request_email_verification",
    dependencies=csrf_documentation,
    summary="Resend an email verification link",
    responses=PUBLIC_ACCOUNT_ERRORS,
)
async def request_verification(data: EmailRequest, request: Request, manager: Manager) -> None:
    """Public with CSRF. Sends a 30-minute verification link to an unverified account.
    Missing, inactive and verified accounts also return 202."""
    require_mail(manager)
    try:
        await manager.request_verify(await manager.get_by_email(str(data.email)), request)
    except (exceptions.UserNotExists, exceptions.UserInactive, exceptions.UserAlreadyVerified):
        return None


@router.post(
    "/auth/verify",
    operation_id="verify_email",
    dependencies=csrf_documentation,
    summary="Verify account email ownership",
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        400: {
            "model": ErrorResponse,
            "description": "Invalid, expired or used verification token.",
        },
    },
)
async def verify(data: LinkToken, request: Request, manager: Manager) -> None:
    """Public with CSRF. Verifies email ownership using the emailed token.
    Expired or used links fail; successful verification does not sign in the account."""
    try:
        await manager.verify(data.token, request)
    except (
        exceptions.InvalidVerifyToken,
        exceptions.UserAlreadyVerified,
        exceptions.UserNotExists,
    ) as error:
        raise HTTPException(400, "Verification link is invalid or expired") from error


@router.post(
    "/auth/forgot-password",
    status_code=202,
    operation_id="request_password_reset",
    dependencies=csrf_documentation,
    summary="Request a password recovery link",
    responses=PUBLIC_ACCOUNT_ERRORS,
)
async def forgot_password(data: EmailRequest, request: Request, manager: Manager) -> None:
    """Public with CSRF. Sends a 30-minute recovery link to an active account.
    Missing and inactive accounts also return 202; email delivery failures return 503."""
    require_mail(manager)
    try:
        await manager.forgot_password(await manager.get_by_email(str(data.email)), request)
    except (exceptions.UserNotExists, exceptions.UserInactive):
        return None


@router.post(
    "/auth/reset-password",
    operation_id="reset_password",
    dependencies=csrf_documentation,
    summary="Reset a password using an email token",
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        400: {"model": ErrorResponse, "description": "Invalid, expired or used recovery token."},
    },
)
async def reset_password(data: ResetPassword, request: Request, manager: Manager) -> None:
    """Public with CSRF. Changes the password and revokes all sessions atomically.
    The recovery token cannot be reused; sign in again afterward."""
    try:
        await manager.reset_password(data.token, data.password, request)
    except (
        exceptions.InvalidResetPasswordToken,
        exceptions.UserNotExists,
        exceptions.UserInactive,
    ) as error:
        raise HTTPException(400, "Recovery link is invalid or expired") from error


@router.get(
    "/me",
    operation_id="get_current_account",
    summary="Read the signed-in account",
    dependencies=session_documentation,
    responses=SESSION_ERRORS,
)
def me(request: Request, response: Response) -> AccountRead:
    """Requires a session. Returns account ID, display name, email and current SQL roles.
    The response is not cached and contains no credential metadata."""
    response.headers["Cache-Control"] = "no-store"
    return AccountRead.model_validate(request.state.account)
