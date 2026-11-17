"""Terraform SQL bootstrap, run as the operator's existing Azure CLI identity."""

import os
from uuid import UUID

from sqlalchemy import text

from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.migrate import run_migrations


def main() -> None:
    name = os.environ["RDI_API_NAME"]
    quoted_name = "[" + name.replace("]", "]]") + "]"
    sid = UUID(os.environ["RDI_API_CLIENT_ID"]).bytes_le
    engine = create_database_engine(Settings(), connect_timeout=60)
    try:
        with engine.begin() as connection:
            run_migrations(connection)
            existing = connection.execute(
                text("SELECT sid FROM sys.database_principals WHERE name = :name"),
                {"name": name},
            ).scalar_one_or_none()
            if existing is None:
                connection.exec_driver_sql(
                    f"CREATE USER {quoted_name} WITH SID = 0x{sid.hex()}, TYPE = E"
                )
            elif bytes(existing) != sid:
                raise RuntimeError("Existing SQL user belongs to a different identity")
            is_owner = connection.execute(
                text("SELECT IS_ROLEMEMBER('db_owner', :name)"), {"name": name}
            ).scalar_one()
            if not is_owner:
                connection.exec_driver_sql(f"ALTER ROLE db_owner ADD MEMBER {quoted_name}")
        print("SQL migration and API db_owner membership configured.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
