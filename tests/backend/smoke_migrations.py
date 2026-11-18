"""Check the development migration permissions on the disposable CI SQL Server."""

from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.migrate import run_migrations


def main() -> None:
    engine = create_database_engine(Settings())
    try:
        with engine.begin() as connection:
            run_migrations(connection, "0002_accounts")
            connection.exec_driver_sql("CREATE USER rdi_migrator WITHOUT LOGIN")
            connection.exec_driver_sql("ALTER ROLE db_ddladmin ADD MEMBER rdi_migrator")
            connection.exec_driver_sql("GRANT VIEW DEFINITION TO rdi_migrator")
            connection.exec_driver_sql(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.alembic_version TO rdi_migrator"
            )

        for _ in range(2):
            with engine.begin() as connection:
                connection.exec_driver_sql("EXECUTE AS USER = 'rdi_migrator'")
                try:
                    run_migrations(connection)
                finally:
                    connection.exec_driver_sql("REVERT")

        print("SQL migrations passed with the development migration permissions.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
