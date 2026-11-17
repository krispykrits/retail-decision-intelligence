"""Explicitly promote an existing, verified account using the operator's SQL access."""

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account
from retail_api.config import Settings
from retail_api.database import create_database_engine


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    args = parser.parse_args()
    engine = create_database_engine(Settings())
    try:
        with Session(engine) as session, session.begin():
            account = session.scalar(select(Account).where(Account.email == args.email.casefold()))
            if account is None or not account.is_verified or not account.is_active:
                parser.exit(1, "An active, verified account is required.\n")
            account.is_superuser = True
        print("Administrator role assigned.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
