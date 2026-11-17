from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import text

from retail_api.config import Settings
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
