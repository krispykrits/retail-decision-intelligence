from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from fastapi_users import exceptions
from fastapi_users.db import BaseUserDatabase
from sqlalchemy import Engine, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from retail_api.accounts.models import Account, AccountAttempt, AccountSession, AccountUser

SESSION_SECONDS = 8 * 60 * 60
ATTEMPT_WINDOW_SECONDS = 15 * 60
ATTEMPT_LIMIT = 20
NETWORK_ATTEMPT_LIMIT = 200


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def token_digest(token: str) -> str:
    return sha256(token.encode()).hexdigest()


class AccountStore(BaseUserDatabase[AccountUser, UUID]):
    """Adapt the existing synchronous SQL/managed-identity engine to FastAPI Users."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    async def run[T](self, operation: Callable[[Session], T]) -> T:
        def execute() -> T:
            with Session(self.engine, expire_on_commit=False) as session, session.begin():
                return operation(session)

        return await run_in_threadpool(execute)

    async def get(self, id: UUID) -> AccountUser | None:
        account = await self.run(lambda session: session.get(Account, id))
        return account.to_user() if account else None

    async def get_by_email(self, email: str) -> AccountUser | None:
        account = await self.run(
            lambda session: session.scalar(select(Account).where(Account.email == email.casefold()))
        )

        return account.to_user() if account else None

    async def create(self, create_dict: dict[str, Any]) -> AccountUser:
        def insert(session: Session) -> AccountUser:
            user = Account(**{**create_dict, "email": create_dict["email"].casefold()})
            session.add(user)
            session.flush()
            return user.to_user()

        try:
            return await self.run(insert)
        except IntegrityError as error:
            raise exceptions.UserAlreadyExists() from error

    async def update(self, user: AccountUser, update_dict: dict[str, Any]) -> AccountUser:
        def update(session: Session) -> AccountUser:
            statement = select(Account).where(Account.id == user.id)
            if self.engine.dialect.name == "mssql":
                statement = statement.with_hint(Account, "WITH (UPDLOCK, HOLDLOCK)", "mssql")
            account = session.scalar(statement)
            if account is None:
                raise exceptions.UserNotExists()
            if update_dict.get("is_verified") and account.is_verified:
                raise exceptions.UserAlreadyVerified()
            if "hashed_password" in update_dict and account.hashed_password != user.hashed_password:
                raise exceptions.InvalidResetPasswordToken()
            for key, value in update_dict.items():
                setattr(account, key, value)
            if "hashed_password" in update_dict:
                # Password changes and revocation commit together, including recovery.
                session.execute(delete(AccountSession).where(AccountSession.account_id == user.id))
            session.flush()
            return account.to_user()

        return await self.run(update)

    async def delete(self, user: AccountUser) -> None:
        def remove(session: Session) -> None:
            session.execute(delete(AccountSession).where(AccountSession.account_id == user.id))
            account = session.get(Account, user.id)
            if account:
                session.delete(account)

        await self.run(remove)

    async def session_account(self, token: str) -> AccountUser | None:
        account = await self.run(
            lambda session: session.scalar(
                select(Account)
                .join(AccountSession)
                .where(
                    AccountSession.token_hash == token_digest(token),
                    AccountSession.expires_at > utcnow(),
                )
            )
        )

        return account.to_user() if account else None

    async def add_session(self, user: AccountUser, token: str) -> None:
        def insert(session: Session) -> None:
            session.execute(delete(AccountSession).where(AccountSession.expires_at <= utcnow()))
            session.add(
                AccountSession(
                    token_hash=token_digest(token),
                    account_id=user.id,
                    expires_at=utcnow() + timedelta(seconds=SESSION_SECONDS),
                )
            )

        await self.run(insert)

    async def remove_session(self, token: str) -> None:
        await self.run(
            lambda session: session.execute(
                delete(AccountSession).where(AccountSession.token_hash == token_digest(token))
            )
        )

    async def limit_attempts(self, identity: str, limit: int = ATTEMPT_LIMIT) -> None:
        def increment(session: Session) -> None:
            now = utcnow()
            cutoff = now - timedelta(seconds=ATTEMPT_WINDOW_SECONDS)
            # SERIALIZABLE key-range locking prevents parallel attempts evading the counter.
            statement = select(AccountAttempt).where(AccountAttempt.key == token_digest(identity))
            if self.engine.dialect.name == "mssql":
                statement = statement.with_hint(AccountAttempt, "WITH (UPDLOCK, HOLDLOCK)", "mssql")
            attempt = session.scalar(statement)
            session.execute(delete(AccountAttempt).where(AccountAttempt.window_start < cutoff))
            if attempt is None or attempt.window_start < cutoff:
                session.add(AccountAttempt(key=token_digest(identity), window_start=now, count=1))
            elif attempt.count >= limit:
                raise HTTPException(
                    429,
                    "Too many attempts. Try again later.",
                    headers={"Retry-After": str(ATTEMPT_WINDOW_SECONDS)},
                )
            else:
                attempt.count += 1

        try:
            await self.run(increment)
        except IntegrityError as error:
            raise HTTPException(429, "Too many simultaneous attempts") from error
