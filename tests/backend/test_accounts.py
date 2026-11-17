import secrets
from collections.abc import Iterator
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from fastapi_users.jwt import generate_jwt
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account, AccountSession
from retail_api.accounts.store import token_digest, utcnow
from retail_api.config import Environment, MailSettings, Settings
from retail_api.main import create_app
from retail_api.migrate import upgrade_database

EMAIL = "analyst@example.com"
PASSWORD = "A long test passphrase"


@pytest.fixture
def account_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, list[EmailMessage], Settings]]:
    messages: list[EmailMessage] = []

    smtp = MagicMock()
    smtp.return_value.__enter__.return_value.send_message.side_effect = messages.append
    monkeypatch.setattr("retail_api.accounts.manager.smtplib.SMTP", smtp)
    settings = Settings(
        environment=Environment.DEVELOPMENT,
        public_url="https://testserver",
        cors_origins=[],
        database_url=SecretStr(f"sqlite:///{tmp_path / 'accounts.db'}"),
        auth_secret=SecretStr(secrets.token_urlsafe(48)),
        mail=MailSettings(
            host="smtp.example.com",
            username="sender",
            password=SecretStr(secrets.token_urlsafe(20)),
            sender="sender@example.com",
        ),
        _env_file=None,
    )
    upgrade_database(settings)
    with TestClient(create_app(settings), base_url=settings.public_url) as client:
        yield client, messages, settings


def post(client: TestClient, path: str, body: dict[str, object] | None = None):
    token = client.get("/api/v1/auth/csrf").json()["token"]
    return client.post(f"/api/v1{path}", json=body, headers={"X-CSRF-Token": token})


def link_token(message: EmailMessage) -> str:
    link = next(line for line in message.get_content().splitlines() if line.startswith("https://"))
    assert urlsplit(link).netloc == "testserver"
    assert not urlsplit(link).query
    return parse_qs(urlsplit(link).fragment)["token"][0]


def enroll(client: TestClient, messages: list[EmailMessage]) -> None:
    assert (
        post(
            client,
            "/auth/register",
            {"email": EMAIL, "password": PASSWORD, "display_name": "Retail analyst"},
        ).status_code
        == 202
    )
    assert post(client, "/auth/verify", {"token": link_token(messages[-1])}).status_code == 200
    assert post(client, "/auth/login", {"email": EMAIL, "password": PASSWORD}).status_code == 204


def test_registration_verification_session_and_sign_out(account_client) -> None:
    client, messages, _ = account_client
    assert (
        post(
            client,
            "/auth/register",
            {"email": EMAIL, "password": PASSWORD, "display_name": "Retail analyst"},
        ).status_code
        == 202
    )
    assert post(client, "/auth/login", {"email": EMAIL, "password": PASSWORD}).status_code == 401
    assert client.get("/api/v1/me").status_code == 401
    token = link_token(messages[-1])
    assert post(client, "/auth/verify", {"token": token}).status_code == 200
    assert post(client, "/auth/verify", {"token": token}).status_code == 400
    response = post(client, "/auth/login", {"email": EMAIL.upper(), "password": PASSWORD})
    assert response.status_code == 204
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Secure" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    profile = client.get("/api/v1/me")
    assert set(profile.json()) == {"id", "email", "display_name", "roles"}
    assert profile.json()["roles"] == ["Analyst"]
    assert profile.headers["cache-control"] == "no-store"
    session_token = client.cookies["__Host-rdi_session"]
    with Session(client.app.state.database) as db:
        assert db.scalar(select(Account)).hashed_password.startswith("$argon2id$")
        assert db.scalar(select(AccountSession)).token_hash == token_digest(session_token)
    assert post(client, "/auth/logout").status_code == 204
    client.cookies.set("__Host-rdi_session", session_token)
    assert client.get("/api/v1/me").status_code == 401


def test_password_recovery_is_single_use_and_revokes_sessions(account_client) -> None:
    client, messages, _ = account_client
    enroll(client, messages)
    assert (
        post(client, "/auth/forgot-password", {"email": "missing@example.com"}).status_code == 202
    )
    assert len(messages) == 1
    assert post(client, "/auth/forgot-password", {"email": EMAIL}).status_code == 202
    recovery = link_token(messages[-1])
    assert post(client, "/auth/verify", {"token": recovery}).status_code == 400
    new_password = "A different long passphrase"
    assert (
        post(
            client, "/auth/reset-password", {"token": recovery, "password": new_password}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/me").status_code == 401
    assert (
        post(client, "/auth/reset-password", {"token": recovery, "password": PASSWORD}).status_code
        == 400
    )
    assert post(client, "/auth/login", {"email": EMAIL, "password": PASSWORD}).status_code == 401
    assert (
        post(client, "/auth/login", {"email": EMAIL, "password": new_password}).status_code == 204
    )


def test_roles_are_authoritative_on_every_request(account_client) -> None:
    client, messages, _ = account_client
    enroll(client, messages)
    assert post(client, "/uploads").status_code == 403
    with Session(client.app.state.database) as db, db.begin():
        db.scalar(select(Account)).is_superuser = True
    assert client.get("/api/v1/me").json()["roles"] == ["Administrator"]
    # Authorized requests reach routing; this feature does not invent an upload endpoint.
    assert post(client, "/uploads").status_code == 404
    with Session(client.app.state.database) as db, db.begin():
        db.scalar(select(Account)).is_superuser = False
    assert post(client, "/uploads").status_code == 403
    with Session(client.app.state.database) as db, db.begin():
        db.scalar(select(Account)).is_active = False
    assert client.get("/api/v1/me").status_code == 401


def test_csrf_and_role_escalation_are_rejected(account_client) -> None:
    client, messages, _ = account_client
    assert client.post("/api/v1/auth/register", json={}).status_code == 403
    csrf = client.get("/api/v1/auth/csrf").json()["token"]
    assert (
        client.post(
            "/api/v1/auth/register",
            headers={"X-CSRF-Token": csrf, "Origin": "https://untrusted.example"},
            json={},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/auth/register", headers={"X-CSRF-Token": csrf + "invalid"}, json={}
        ).status_code
        == 403
    )
    for extra in ({"is_superuser": True}, {"is_verified": True}, {"role": "Administrator"}):
        response = post(
            client,
            "/auth/register",
            {"email": EMAIL, "password": PASSWORD, "display_name": "Analyst", **extra},
        )
        assert response.status_code == 422
        assert PASSWORD not in response.text


def test_expired_and_malformed_credentials_fail_closed(account_client) -> None:
    client, messages, settings = account_client
    enroll(client, messages)
    expired = generate_jwt(
        {
            "sub": client.get("/api/v1/me").json()["id"],
            "email": EMAIL,
            "aud": "fastapi-users:verify",
        },
        settings.auth_secret,
        -60,
    )
    assert post(client, "/auth/verify", {"token": expired}).status_code == 400
    assert (
        post(
            client, "/auth/reset-password", {"token": "malformed", "password": PASSWORD}
        ).status_code
        == 400
    )
    with Session(client.app.state.database) as db, db.begin():
        db.scalar(select(AccountSession)).expires_at = utcnow() - timedelta(seconds=1)
    assert client.get("/api/v1/me").status_code == 401


def test_missing_mail_is_not_reported_as_success(account_client) -> None:
    client, messages, settings = account_client
    settings.mail = None
    response = post(
        client, "/auth/register", {"email": EMAIL, "password": PASSWORD, "display_name": "Analyst"}
    )
    assert response.status_code == 503
    assert not messages
    with Session(client.app.state.database) as db:
        assert db.scalar(select(Account)) is None


def test_authentication_attempts_are_rate_limited(account_client) -> None:
    client, _, _ = account_client
    for _ in range(20):
        assert (
            post(client, "/auth/login", {"email": EMAIL, "password": PASSWORD}).status_code == 401
        )
    assert post(client, "/auth/login", {"email": EMAIL, "password": PASSWORD}).status_code == 429
