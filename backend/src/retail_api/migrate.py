import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine
from sqlalchemy.exc import DBAPIError

from retail_api.config import Settings
from retail_api.database import create_database_engine

MIGRATIONS = Path(__file__).parent / "migrations"


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


def run_migrations(connection: Connection) -> None:
    configuration = Config()
    configuration.set_main_option("script_location", str(MIGRATIONS))
    configuration.attributes["connection"] = connection
    command.upgrade(configuration, "head")


def upgrade_database(settings: Settings) -> None:
    """Run once using the migration identity, separately from API startup."""
    engine = create_database_engine(settings, connect_timeout=60)
    try:
        with connect_for_migration(engine) as connection, connection.begin():
            run_migrations(connection)
    finally:
        engine.dispose()


if __name__ == "__main__":
    upgrade_database(Settings())
