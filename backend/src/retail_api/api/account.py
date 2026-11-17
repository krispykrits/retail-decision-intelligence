import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import APIKeyHeader, OAuth2PasswordRequestForm
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
    LinkToken,
    RegisterAccount,
    ResetPassword,
    RoleChange,
)
from retail_api.accounts.store import AccountStore
from retail_api.config import Environment, Settings

router = APIRouter(tags=["account"])
csrf_documentation = [
    Depends(APIKeyHeader(name=CSRF_HEADER, scheme_name="CSRFToken", auto_error=False))
]


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_manager(request: Request) -> AccountManager:
    return AccountManager(AccountStore(request.app.state.database), get_settings(request))


Manager = Annotated[AccountManager, Depends(get_manager)]


def require_mail(manager: AccountManager) -> None:
    if manager.settings.mail is None:
        raise HTTPException(503, "Account email delivery is not configured")


@router.get("/auth/config", operation_id="get_account_configuration")
def account_configuration(request: Request, response: Response) -> AccountConfiguration:
    settings = get_settings(request)
    response.headers["Cache-Control"] = "no-store"
    return AccountConfiguration(
        configured=settings.auth_secret is not None, email_delivery=settings.mail is not None
    )


@router.get("/auth/csrf", operation_id="get_csrf_token")
def csrf(request: Request, response: Response) -> CsrfToken:
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
)
async def register(data: RegisterAccount, request: Request, manager: Manager) -> None:
    require_mail(manager)
    try:
        await manager.create(ManagedAccountCreate(**data.model_dump()), safe=True, request=request)
    except exceptions.UserAlreadyExists:
        # Match the successful response so registration does not disclose existing accounts.
        return None


@router.post(
    "/auth/login", status_code=204, operation_id="sign_in", dependencies=csrf_documentation
)
async def login(data: Credentials, request: Request, manager: Manager) -> Response:
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
    "/auth/logout", status_code=204, operation_id="sign_out", dependencies=csrf_documentation
)
async def logout(request: Request) -> Response:
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
)
async def request_verification(data: EmailRequest, request: Request, manager: Manager) -> None:
    require_mail(manager)
    try:
        await manager.request_verify(await manager.get_by_email(str(data.email)), request)
    except (exceptions.UserNotExists, exceptions.UserInactive, exceptions.UserAlreadyVerified):
        return None


@router.post("/auth/verify", operation_id="verify_email", dependencies=csrf_documentation)
async def verify(data: LinkToken, request: Request, manager: Manager) -> None:
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
)
async def forgot_password(data: EmailRequest, request: Request, manager: Manager) -> None:
    require_mail(manager)
    try:
        await manager.forgot_password(await manager.get_by_email(str(data.email)), request)
    except (exceptions.UserNotExists, exceptions.UserInactive):
        return None


@router.post("/auth/reset-password", operation_id="reset_password", dependencies=csrf_documentation)
async def reset_password(data: ResetPassword, request: Request, manager: Manager) -> None:
    try:
        await manager.reset_password(data.token, data.password, request)
    except (
        exceptions.InvalidResetPasswordToken,
        exceptions.UserNotExists,
        exceptions.UserInactive,
    ) as error:
        raise HTTPException(400, "Recovery link is invalid or expired") from error


@router.get("/me", operation_id="get_current_account")
def me(request: Request, response: Response) -> AccountRead:
    """Return the account identified by the server-issued HttpOnly session cookie."""
    response.headers["Cache-Control"] = "no-store"
    return AccountRead.model_validate(request.state.account)


@router.put(
    "/accounts/{account_id}/role",
    operation_id="change_account_role",
    dependencies=csrf_documentation,
)
async def change_role(account_id: UUID, data: RoleChange, request: Request) -> AccountRead:
    if account_id == request.state.account.id:
        raise HTTPException(403, "An administrator cannot change their own role")
    store = AccountStore(request.app.state.database)
    account = await store.get(account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    return AccountRead.model_validate(
        await store.update(account, {"is_superuser": data.role is Role.ADMINISTRATOR})
    )
