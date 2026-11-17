"""CI-only session/role check against the disposable SQL Server and running container."""

import json
import secrets
from http.cookies import SimpleCookie
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from pwdlib import PasswordHash
from sqlalchemy import delete
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account, AccountSession
from retail_api.config import Settings
from retail_api.database import create_database_engine


def main() -> None:
    # This script runs inside the isolated CI container, never against Azure.
    base_url = "http://127.0.0.1:8000/api/v1"
    cookies: dict[str, str] = {}

    def request(method: str, path: str, expected: int, body: object = None) -> dict[str, object]:
        headers = {"Content-Type": "application/json"}
        if method != "GET":
            headers["X-CSRF-Token"] = str(request("GET", "/auth/csrf", 200)["token"])
        headers["Cookie"] = "; ".join(f"{key}={value}" for key, value in cookies.items())
        data = None if body is None else json.dumps(body).encode()
        try:
            response = urlopen(
                Request(base_url + path, data=data, headers=headers, method=method), timeout=10
            )
        except HTTPError as error:
            response = error
        with response:
            assert response.status == expected, (
                f"Account smoke failed: {method} {path} -> {response.status}"
            )
            for header in response.headers.get_all("Set-Cookie", []):
                parsed = SimpleCookie(header)
                for name, morsel in parsed.items():
                    assert morsel["secure"] and morsel["httponly"]
                    cookies[name] = morsel.value
            content = response.read()
            return json.loads(content) if content else {}

    engine = create_database_engine(Settings())
    account_id = uuid4()
    email = f"ci-{account_id.hex}@example.com"
    password = secrets.token_urlsafe(32)
    try:
        # Verification delivery is covered separately; no real mailbox is used in CI.
        with Session(engine) as db, db.begin():
            db.add(
                Account(
                    id=account_id,
                    email=email,
                    display_name="CI account",
                    hashed_password=PasswordHash.recommended().hash(password),
                    is_verified=True,
                )
            )
        request("GET", "/me", 401)
        request("POST", "/auth/login", 204, {"email": email, "password": password})
        assert request("GET", "/me", 200)["roles"] == ["Analyst"]
        request("POST", "/uploads", 403, {})
        with Session(engine) as db, db.begin():
            account = db.get(Account, account_id)
            assert account is not None
            account.is_superuser = True
        assert request("GET", "/me", 200)["roles"] == ["Administrator"]
        request("POST", "/uploads", 404, {})
        previous = cookies["__Host-rdi_session"]
        request("POST", "/auth/logout", 204)
        cookies["__Host-rdi_session"] = previous
        request("GET", "/me", 401)
        print("Account SQL smoke passed: sign-in, cookies, immediate role checks and revocation.")
    finally:
        with Session(engine) as db, db.begin():
            db.execute(delete(AccountSession).where(AccountSession.account_id == account_id))
            db.execute(delete(Account).where(Account.id == account_id))
        engine.dispose()


if __name__ == "__main__":
    main()
