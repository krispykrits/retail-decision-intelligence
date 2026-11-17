from pathlib import Path

from alembic import command
from alembic.config import Config

from retail_api.config import Settings
from retail_api.database import create_database_engine

MIGRATIONS = Path(__file__).parent / "migrations"


def upgrade_database(settings: Settings) -> None:
    """Run once using the migration identity, separately from API startup."""
    configuration = Config()
    configuration.set_main_option("script_location", str(MIGRATIONS))
    engine = create_database_engine(settings)
    try:
        with engine.begin() as connection:
            configuration.attributes["connection"] = connection
            command.upgrade(configuration, "head")
    finally:
        engine.dispose()


if __name__ == "__main__":
    upgrade_database(Settings())
