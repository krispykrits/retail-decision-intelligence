import os
import struct
from typing import Any

from azure.identity import AzureCliCredential, ManagedIdentityCredential
from sqlalchemy import URL, Engine, create_engine, event
from sqlalchemy.pool import NullPool

from retail_api.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    """Connect lazily; close SQL connections between requests so SQL can pause."""
    url: str | URL = settings.database_url.get_secret_value()
    if settings.sql_server:
        url = URL.create(
            "mssql+pyodbc",
            host=settings.sql_server,
            database=settings.sql_database,
            query={
                "driver": "ODBC Driver 18 for SQL Server",
                "Encrypt": "yes",
                "TrustServerCertificate": "no",
                "ConnectRetryCount": "1",
                "ConnectRetryInterval": "1",
            },
        )
    if str(url).startswith("sqlite"):
        return create_engine(url, hide_parameters=True)

    import pyodbc

    # Disable the driver's second pool as well as SQLAlchemy's pool.
    pyodbc.pooling = False
    engine = create_engine(
        url, poolclass=NullPool, hide_parameters=True, connect_args={"timeout": 5}
    )

    @event.listens_for(engine, "connect")
    def set_query_timeout(connection: Any, record: Any) -> None:
        connection.timeout = 5

    if settings.sql_server:
        client_id = os.environ.get("AZURE_CLIENT_ID")
        credential = (
            ManagedIdentityCredential(client_id=client_id)
            if client_id
            else AzureCliCredential(process_timeout=5)
        )

        @event.listens_for(engine, "do_connect")
        def provide_token(
            dialect: Any, record: Any, args: list[Any], parameters: dict[str, Any]
        ) -> None:
            # SQLAlchemy adds Trusted_Connection when no user/password is supplied.
            args[0] = args[0].replace(";Trusted_Connection=Yes", "")
            token = credential.get_token("https://database.windows.net/.default")
            encoded = token.token.encode("utf-16-le")
            parameters["attrs_before"] = {
                1256: struct.pack(f"<I{len(encoded)}s", len(encoded), encoded)
            }

        @event.listens_for(engine, "engine_disposed")
        def close_credential(disposed_engine: Engine) -> None:
            credential.close()

    return engine
