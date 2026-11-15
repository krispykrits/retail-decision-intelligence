from fastapi.testclient import TestClient
from pydantic import SecretStr
from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.main import create_app
from sqlalchemy import text


def test_health_does_not_require_a_database() -> None:
    settings = Settings(database_url=SecretStr("mssql+pyodbc://unconfigured"), _env_file=None)
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "retail-decision-intelligence",
        "version": "0.1.0",
    }


def test_openapi_exposes_the_versioned_health_contract() -> None:
    with TestClient(create_app(Settings(_env_file=None))) as client:
        schema = client.get("/api/v1/openapi.json").json()
        assert client.get("/health").status_code == 404
    health = schema["paths"]["/api/v1/health"]["get"]
    assert health["operationId"] == "get_health"
    assert health["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/HealthResponse"
    }


def test_cors_allows_only_configured_origins() -> None:
    settings = Settings(cors_origins=["http://localhost:5173"], _env_file=None)
    with TestClient(create_app(settings)) as client:
        allowed = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
        denied = client.get("/api/v1/health", headers={"Origin": "https://untrusted.example"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_local_sql_configuration_executes_a_query() -> None:
    settings = Settings(database_url=SecretStr("sqlite+pysqlite:///:memory:"), _env_file=None)
    engine = create_database_engine(settings)
    try:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT 1")).scalar_one() == 1
    finally:
        engine.dispose()
