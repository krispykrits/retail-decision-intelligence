from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection

from retail_api.config import Settings
from retail_api.database import create_database_engine

MIGRATIONS = Path(__file__).parent / "migrations"


def run_migrations(connection: Connection, revision: str = "head") -> None:
    configuration = Config()
    configuration.set_main_option("script_location", str(MIGRATIONS))
    configuration.attributes["connection"] = connection
    command.upgrade(configuration, revision)


def upgrade_database(settings: Settings) -> None:
    """Run once using the migration identity, separately from API startup."""
    engine = create_database_engine(settings)
    try:
        with engine.begin() as connection:
            run_migrations(connection)
    finally:
        engine.dispose()


if __name__ == "__main__":
    upgrade_database(Settings())
