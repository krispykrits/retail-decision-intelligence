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
    engine = create_database_engine(Settings())
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
            connection.exec_driver_sql(f"GRANT CONNECT TO {quoted_name}")
            connection.exec_driver_sql(
                f"GRANT SELECT ON OBJECT::dbo.alembic_version TO {quoted_name}"
            )
        print("SQL migration and least-privilege API identity access configured.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
