from sqlalchemy import Engine, create_engine

from retail_api.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    """Create an engine lazily; health checks never open a database connection."""
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        hide_parameters=True,
    )
