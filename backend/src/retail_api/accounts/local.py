import os
from getpass import getpass
from pathlib import Path
from secrets import token_urlsafe

from pwdlib import PasswordHash
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account
from retail_api.accounts.schemas import RegisterAccount
from retail_api.config import Environment, Settings
from retail_api.database import create_database_engine
from retail_api.migrate import run_migrations


def main() -> None:
    settings = Settings()
    database = make_url(settings.database_url.get_secret_value())
    if (
        settings.environment is not Environment.LOCAL
        or settings.sql_server
        or database.drivername not in {"sqlite", "sqlite+pysqlite"}
        or database.query
    ):
        raise SystemExit("Local account setup requires a local SQLite database.")

    additions = []
    if database.database in {None, "", ":memory:"}:
        if "database_url" in settings.model_fields_set:
            raise SystemExit("Set RDI_DATABASE_URL to a file-backed SQLite database.")
        additions.append("RDI_DATABASE_URL=sqlite+pysqlite:///./retail.db")
    if settings.auth_secret is None:
        additions.append(f"RDI_AUTH_SECRET={token_urlsafe(48)}")

    email = input("Email: ").strip()
    display_name = input("Display name: ").strip()
    password = getpass("Password (15–128 characters): ")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match.")
    try:
        data = RegisterAccount(email=email, display_name=display_name, password=password)
    except ValidationError as error:
        raise SystemExit(error.json(include_input=False, include_context=False)) from None

    if additions:
        fd = os.open(Path(".env"), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as file:
            file.write("\n" + "\n".join(additions) + "\n")
        settings = Settings()

    engine = create_database_engine(settings)
    email = data.email.casefold()
    try:
        with engine.begin() as connection:
            run_migrations(connection)
        with Session(engine) as session, session.begin():
            if session.scalar(select(Account.id).where(Account.email == email)) is not None:
                raise SystemExit("That local account already exists. Sign in with its password.")
            session.add(
                Account(
                    email=email,
                    display_name=data.display_name,
                    hashed_password=PasswordHash.recommended().hash(data.password),
                    is_verified=True,
                )
            )
    except IntegrityError:
        raise SystemExit(
            "Could not create the local account. The email may already exist."
        ) from None
    finally:
        engine.dispose()
    print("Local Analyst account created. Sign in at http://localhost:5173.")


if __name__ == "__main__":
    main()
