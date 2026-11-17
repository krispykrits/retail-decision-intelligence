import secrets
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from fastapi.security import APIKeyCookie, APIKeyHeader, OAuth2PasswordRequestForm
from fastapi_users import exceptions

from retail_api.accounts.manager import AccountManager, ManagedAccountCreate
from retail_api.accounts.models import Role
from retail_api.accounts.policy import (
    CSRF_HEADER,
    CSRF_SECONDS,
    cookie_name,
    cookie_transport,
    csrf_signer,
)
from retail_api.accounts.schemas import (
    AccountConfiguration,
    AccountRead,
    Credentials,
    CsrfToken,
    EmailRequest,
    ErrorResponse,
    LinkToken,
    RegisterAccount,
    ResetPassword,
    RoleChange,
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
            description=(
                "Call GET /api/v1/auth/csrf, then enter its token in Authorize. Keep the "
                "matching cookie. Required on every write, including sign-in."
            ),
        )
    )
]
session_documentation = [
    Depends(
        APIKeyCookie(
            name="rdi_session",
            scheme_name="LocalSession",
            auto_error=False,
            description=(
                "Local HTTP session cookie, issued by sign-in and sent automatically by "
                "the browser."
            ),
        )
    ),
    Depends(
        APIKeyCookie(
            name="__Host-rdi_session",
            scheme_name="DevelopmentSession",
            auto_error=False,
            description=(
                "Development HTTPS session cookie, issued by sign-in and sent "
                "automatically by the browser."
            ),
        )
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
        "description": "Account configuration, SQL or required email delivery is unavailable.",
    }
}
SESSION_ERRORS: dict[int | str, dict[str, Any]] = {
    **SERVICE_ERRORS,
    401: {
        "model": ErrorResponse,
        "description": (
            "Session is missing, invalid, expired or revoked, or the account is "
            "inactive/unverified."
        ),
    },
}
WRITE_ERRORS: dict[int | str, dict[str, Any]] = {
    **SERVICE_ERRORS,
    403: {
        "model": ErrorResponse,
        "description": (
            "CSRF cookie/header is missing, mismatched or expired, or the request "
            "Origin is untrusted."
        ),
    },
}
PUBLIC_ACCOUNT_ERRORS: dict[int | str, dict[str, Any]] = {
    **WRITE_ERRORS,
    429: {
        "model": ErrorResponse,
        "description": "Too many account requests. Retry after the rate-limit window.",
        "headers": {
            "Retry-After": {
                "description": "Seconds to wait when the rate-limit window is available.",
                "schema": {"type": "integer"},
            }
        },
    },
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
    "/auth/config",
    operation_id="get_account_configuration",
    summary="Read public account configuration",
)
def account_configuration(request: Request, response: Response) -> AccountConfiguration:
    """Public endpoint. Returns configuration flags without secrets or SMTP credentials.

    Responses are not cached. A configured sender has not necessarily been delivery-tested.
    """
    settings = get_settings(request)
    response.headers["Cache-Control"] = "no-store"
    return AccountConfiguration(
        configured=settings.auth_secret is not None, email_delivery=settings.mail is not None
    )


@router.get(
    "/auth/csrf",
    operation_id="get_csrf_token",
    summary="Get a CSRF token and cookie",
    responses=SERVICE_ERRORS,
)
def csrf(request: Request, response: Response) -> CsrfToken:
    """Public endpoint. Sets an HttpOnly, SameSite=Strict cookie and returns its signed token.

    Send the token in `X-CSRF-Token` on writes, including registration and sign-in.
    In Swagger, enter it under **Authorize → CSRFToken**. Keep cookies enabled and
    use the same origin. Refresh the token after one hour or after replacing its cookie.
    Development cookies require HTTPS. This endpoint does not sign in the caller.
    """
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
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        202: {
            "description": (
                "Registration accepted; the same response is returned for existing accounts."
            )
        },
    },
)
async def register(data: RegisterAccount, request: Request, manager: Manager) -> None:
    """Public write requiring CSRF protection. Creates an unverified Analyst and emails a link.

    Existing accounts also return 202 without changing credentials or permissions.
    Use request-verify to resend a link. Account/verification flags cannot be supplied.
    Email delivery must be configured; sign-in is blocked until verification succeeds.
    """
    require_mail(manager)
    try:
        await manager.create(ManagedAccountCreate(**data.model_dump()), safe=True, request=request)
    except exceptions.UserAlreadyExists:
        # Match the successful response so registration does not disclose existing accounts.
        return None


@router.post(
    "/auth/login",
    status_code=204,
    operation_id="sign_in",
    dependencies=csrf_documentation,
    summary="Sign in with email and password",
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        204: {"description": "Session cookie issued; no response body."},
        401: {
            "model": ErrorResponse,
            "description": "Credentials are incorrect, or the account is inactive/unverified.",
        },
    },
)
async def login(data: Credentials, request: Request, manager: Manager) -> Response:
    """Public write requiring CSRF protection. Accepts JSON credentials for a verified account.

    Issues an eight-hour HttpOnly, SameSite=Strict session cookie (Secure in development).
    Replaces this browser's previous session; other sessions remain active. No session token
    is returned in JSON. Requests are rate-limited by account and connection address.
    """
    await AccountStore(request.app.state.database).limit_attempts(
        f"login:{str(data.email).casefold()}"
    )
    credentials = OAuth2PasswordRequestForm(username=str(data.email), password=data.password)
    user = await manager.authenticate(credentials)
    if user is None or not user.is_active or not user.is_verified:
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
    responses={
        **SESSION_ERRORS,
        **WRITE_ERRORS,
        204: {"description": "Session revoked and cookie cleared; no response body."},
    },
)
async def logout(request: Request) -> Response:
    """Requires a valid session and CSRF token. Revokes this browser's session in SQL.

    Either application role can sign out. Other sessions remain active. Reusing the revoked
    cookie fails authentication; an already-expired or revoked session returns 401.
    """
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
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        202: {
            "description": (
                "Request accepted; does not reveal account existence or verification status."
            )
        },
    },
)
async def request_verification(data: EmailRequest, request: Request, manager: Manager) -> None:
    """Public write requiring CSRF protection. Emails a new link to an active, unverified account.

    Missing, inactive and already-verified accounts also return 202. Links expire after
    30 minutes and cannot verify an account again after successful verification.
    """
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
        200: {"description": "Email verified; sign-in is now available."},
        400: {
            "model": ErrorResponse,
            "description": (
                "Verification token is invalid, expired, already used or belongs to another flow."
            ),
        },
    },
)
async def verify(data: LinkToken, request: Request, manager: Manager) -> None:
    """Public write requiring CSRF protection. Consumes the verification email's token.

    This verifies email ownership without creating a session or granting Administrator access.
    Recovery tokens cannot be used here. Submit explicitly rather than following a GET link.
    """
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
    responses={
        **PUBLIC_ACCOUNT_ERRORS,
        202: {"description": "Request accepted; does not reveal whether the account exists."},
    },
)
async def forgot_password(data: EmailRequest, request: Request, manager: Manager) -> None:
    """Public write with CSRF protection. Emails a 30-minute recovery link to an active account.

    Missing or inactive accounts also return 202. Requesting a link does not change the password
    or revoke sessions. Actual SMTP failures return 503 rather than reporting successful delivery.
    """
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
        200: {"description": "Password changed and all account sessions revoked; sign in again."},
        400: {
            "model": ErrorResponse,
            "description": (
                "Recovery token is invalid, expired, already used or belongs to another flow."
            ),
        },
    },
)
async def reset_password(data: ResetPassword, request: Request, manager: Manager) -> None:
    """Public write requiring CSRF protection. Sets a new password using a valid recovery token.

    Revokes every session in the same SQL transaction as the password change. The token cannot
    be reused afterward. Does not create a new session or verify an unverified email address.
    """
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
    """Requires a session cookie. Returns account ID, display name, email and current roles.

    SQL is authoritative: role changes and account disabling apply on the next request.
    Responses are not cached and contain no password hashes, session tokens or credential metadata.
    """
    response.headers["Cache-Control"] = "no-store"
    return AccountRead.model_validate(request.state.account)


@router.put(
    "/accounts/{account_id}/role",
    operation_id="change_account_role",
    summary="Change another account's application role",
    openapi_extra=cookie_write_security,
    responses={
        **SESSION_ERRORS,
        **WRITE_ERRORS,
        403: {
            "model": ErrorResponse,
            "description": (
                "Administrator access is required; self-changes and invalid CSRF/origin "
                "are forbidden."
            ),
        },
        404: {"model": ErrorResponse, "description": "The target account does not exist."},
    },
)
async def change_role(
    account_id: Annotated[UUID, Path(description="UUID of another existing application account.")],
    data: RoleChange,
    request: Request,
) -> AccountRead:
    """Requires an Administrator session and CSRF token. Assigns Analyst or Administrator in SQL.

    An administrator cannot change their own role. The target's next API request uses the new
    permission without waiting for token expiry. Returns the target's public account profile.
    """
    if account_id == request.state.account.id:
        raise HTTPException(403, "An administrator cannot change their own role")
    store = AccountStore(request.app.state.database)
    account = await store.get(account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    return AccountRead.model_validate(
        await store.update(account, {"is_superuser": data.role is Role.ADMINISTRATOR})
    )
