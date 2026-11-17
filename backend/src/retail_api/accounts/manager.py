import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlencode
from uuid import UUID

from fastapi import HTTPException, Request
from fastapi_users import BaseUserManager, UUIDIDMixin, exceptions, schemas
from starlette.concurrency import run_in_threadpool

from retail_api.accounts.models import AccountUser
from retail_api.accounts.store import AccountStore
from retail_api.config import Settings

MIN_PASSWORD_LENGTH = 15
MAX_PASSWORD_LENGTH = 128
LINK_LIFETIME_SECONDS = 30 * 60
SMTP_TIMEOUT_SECONDS = 10


class ManagedAccountCreate(schemas.BaseUserCreate):
    display_name: str


class AccountManager(UUIDIDMixin, BaseUserManager[AccountUser, UUID]):
    def __init__(self, store: AccountStore, settings: Settings) -> None:
        if settings.auth_secret is None:
            raise HTTPException(503, "Account access is not configured")
        super().__init__(store)
        self.settings = settings
        self.reset_password_token_secret = settings.auth_secret
        self.verification_token_secret = settings.auth_secret
        self.reset_password_token_lifetime_seconds = LINK_LIFETIME_SECONDS
        self.verification_token_lifetime_seconds = LINK_LIFETIME_SECONDS

    async def validate_password(self, password: str, user: schemas.UC | AccountUser) -> None:
        if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
            raise exceptions.InvalidPasswordException(
                reason=f"Use {MIN_PASSWORD_LENGTH}–{MAX_PASSWORD_LENGTH} characters"
            )

    async def on_after_register(self, user: AccountUser, request: Request | None = None) -> None:
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: AccountUser, token: str, request: Request | None = None
    ) -> None:
        await self.send_link(user, token, "verify", "Verify your email")

    async def on_after_forgot_password(
        self, user: AccountUser, token: str, request: Request | None = None
    ) -> None:
        await self.send_link(user, token, "reset", "Reset your password")

    async def send_link(self, user: AccountUser, token: str, action: str, subject: str) -> None:
        mail = self.settings.mail
        if mail is None:
            raise HTTPException(503, "Account email delivery is not configured")
        # A fragment keeps the token out of web-server access logs and referrer URLs.
        link = (
            f"{self.settings.public_url.rstrip('/')}/account/{action}#{urlencode({'token': token})}"
        )
        message = EmailMessage()
        message["From"] = str(mail.sender)
        message["To"] = user.email
        message["Subject"] = f"Retail Decision Intelligence — {subject}"
        message.set_content(
            f"{subject}:\n\n{link}\n\nThis link expires in {LINK_LIFETIME_SECONDS // 60} minutes."
        )

        def send() -> None:
            try:
                with smtplib.SMTP(mail.host, mail.port, timeout=SMTP_TIMEOUT_SECONDS) as client:
                    client.starttls(context=ssl.create_default_context())
                    client.login(mail.username, mail.password.get_secret_value())
                    client.send_message(message)
            except (OSError, smtplib.SMTPException) as error:
                # SMTP exceptions can contain recipient addresses or provider details.
                raise HTTPException(
                    503, "Account email could not be sent. Try again later."
                ) from error

        await run_in_threadpool(send)
