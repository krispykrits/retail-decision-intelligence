from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Role(StrEnum):
    ANALYST = "Analyst"
    ADMINISTRATOR = "Administrator"


@dataclass
class AccountUser:
    id: UUID
    email: str
    display_name: str
    hashed_password: str
    is_active: bool
    is_verified: bool
    is_superuser: bool

    @property
    def roles(self) -> list[Role]:
        return [Role.ADMINISTRATOR if self.is_superuser else Role.ANALYST]


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_superuser: Mapped[bool] = mapped_column("is_administrator", Boolean, default=False)

    def to_user(self) -> AccountUser:
        return AccountUser(
            id=self.id,
            email=self.email,
            display_name=self.display_name,
            hashed_password=self.hashed_password,
            is_active=self.is_active,
            is_verified=self.is_verified,
            is_superuser=self.is_superuser,
        )


class AccountSession(Base):
    __tablename__ = "account_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class AccountAttempt(Base):
    __tablename__ = "account_attempts"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime)
    count: Mapped[int]
