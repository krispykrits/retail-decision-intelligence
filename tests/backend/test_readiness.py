import struct
from pathlib import Path
from unittest.mock import Mock
from uuid import UUID

import pytest
from azure.core.credentials import AccessToken
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import text

import retail_api.database as database
from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.main import create_app
from retail_api.migrate import upgrade_database


def test_migration_and_readiness(tmp_path: Path) -> None:
    settings = Settings(
        database_url=SecretStr(f"sqlite:///{tmp_path / 'retail.db'}"), _env_file=None
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/ready").status_code == 503
        upgrade_database(settings)
        upgrade_database(settings)  # Repeated deploys must be safe.
        assert client.get("/api/v1/ready").json() == {"status": "ready"}
        with client.app.state.database.begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num = 'unexpected'"))
        assert client.get("/api/v1/ready").status_code == 503


def test_database_failure_does_not_break_liveness_or_leak_details(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    settings = Settings(
        database_url=SecretStr(f"sqlite:///{tmp_path / 'sensitive-name.db'}"), _env_file=None
    )
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/v1/ready")
        health = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["retry-after"] == "15"
    assert str(UUID(response.headers["x-correlation-id"])) in caplog.text
    assert "sensitive-name" not in caplog.text + response.text
    assert "SELECT" not in caplog.text + response.text
    assert health.status_code == 200
    assert health.headers["x-correlation-id"] != response.headers["x-correlation-id"]


def test_sql_engine_uses_managed_identity_without_opening_a_connection() -> None:
    settings = Settings(
        sql_server="example.database.windows.net", sql_database="retail", _env_file=None
    )
    engine = create_database_engine(settings)
    try:
        assert engine.url.drivername == "mssql+pyodbc"
        assert engine.url.password is None
        assert engine.url.query["Encrypt"] == "yes"
        assert engine.url.query["TrustServerCertificate"] == "no"
    finally:
        engine.dispose()


def test_access_token_is_renewed_for_each_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AZURE_CLIENT_ID", raising=False)
    credential = Mock()
    credential.get_token.side_effect = [AccessToken("first", 1), AccessToken("second", 2)]
    monkeypatch.setattr(database, "AzureCliCredential", Mock(return_value=credential))
    engine = create_database_engine(
        Settings(sql_server="example.database.windows.net", sql_database="retail", _env_file=None)
    )
    try:
        for token in ("first", "second"):
            args = ["DRIVER=ODBC Driver 18 for SQL Server;Trusted_Connection=Yes"]
            parameters: dict[str, object] = {}
            engine.dialect.dispatch.do_connect(engine.dialect, None, args, parameters)
            assert "Trusted_Connection" not in args[0]
            encoded = token.encode("utf-16-le")
            assert parameters["attrs_before"] == {
                1256: struct.pack(f"<I{len(encoded)}s", len(encoded), encoded)
            }
    finally:
        engine.dispose()
    assert credential.get_token.call_count == 2
    credential.close.assert_called_once()
