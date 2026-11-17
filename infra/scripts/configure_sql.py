"""Terraform SQL bootstrap, run as the operator's existing Azure CLI identity."""

import os
import time
from uuid import UUID

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import DBAPIError

from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.migrate import run_migrations


def connect_for_migration(engine: Engine) -> Connection:
    # A paused serverless database returns 40613 while resuming; retry before any SQL runs.
    for delay in (5, 10, 20, 40):
        try:
            return engine.connect()
        except DBAPIError as error:
            if "(40613)" not in str(error.orig):
                raise
            print(f"SQL is temporarily unavailable; retrying connection in {delay}s.", flush=True)
            time.sleep(delay)
    return engine.connect()


def ensure_user(connection: Connection, name: str, client_id: str) -> str:
    # Quote the SQL identifier; encode the managed identity's client ID as a SQL SID.
    quoted_name = "[" + name.replace("]", "]]") + "]"
    sid = UUID(client_id).bytes_le
    existing = connection.execute(
        text("SELECT sid FROM sys.database_principals WHERE name = :name"), {"name": name}
    ).scalar_one_or_none()
    if existing is None:
        # Direct SID mapping avoids requiring Microsoft Graph lookup access.
        connection.exec_driver_sql(f"CREATE USER {quoted_name} WITH SID = 0x{sid.hex()}, TYPE = E")
    elif bytes(existing) != sid:
        raise RuntimeError("Existing SQL user belongs to a different identity")
    return quoted_name


def main() -> None:
    # Deployment can wait longer than API readiness for a serverless SQL connection.
    engine = create_database_engine(Settings(), connect_timeout=60)
    try:
        with connect_for_migration(engine) as connection, connection.begin():
            # Apply pending Alembic revisions before the API uses the database.
            run_migrations(connection)
            name = os.environ["RDI_API_NAME"]
            quoted_name = ensure_user(connection, name, os.environ["RDI_API_CLIENT_ID"])
            # Skip the role change when a previous deployment already granted ownership.
            is_owner = connection.execute(
                text("SELECT IS_ROLEMEMBER('db_owner', :name)"), {"name": name}
            ).scalar_one()
            if not is_owner:
                connection.exec_driver_sql(f"ALTER ROLE db_owner ADD MEMBER {quoted_name}")

            # Only operator bootstrap supplies these values. Routine CI cannot grant roles.
            if deployment_id := os.environ.get("RDI_DEPLOYMENT_CLIENT_ID"):
                deployment_name = os.environ["RDI_DEPLOYMENT_NAME"]
                deployment_user = ensure_user(connection, deployment_name, deployment_id)
                is_migrator = connection.execute(
                    text("SELECT IS_ROLEMEMBER('db_ddladmin', :name)"), {"name": deployment_name}
                ).scalar_one()
                if not is_migrator:
                    connection.exec_driver_sql(
                        f"ALTER ROLE db_ddladmin ADD MEMBER {deployment_user}"
                    )
                # Permit migration tracking and metadata reads, without db_owner membership.
                connection.exec_driver_sql(
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.alembic_version "
                    f"TO {deployment_user}"
                )
                connection.exec_driver_sql(f"GRANT VIEW DEFINITION TO {deployment_user}")
        print("SQL migrations and identity access configured.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
