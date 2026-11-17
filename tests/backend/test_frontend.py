from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from retail_api.config import Environment, Settings
from retail_api.main import create_app


@pytest.mark.parametrize("environment", [Environment.LOCAL, Environment.DEVELOPMENT])
def test_frontend_deep_links_and_api_share_one_origin(
    tmp_path: Path, environment: Environment
) -> None:
    (tmp_path / "index.html").write_text('<div id="root"></div>')
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets/app.js").write_text("console.log('app')")
    settings = Settings(
        environment=environment, static_directory=tmp_path, cors_origins=[], _env_file=None
    )
    with TestClient(create_app(settings)) as client:
        for path in [
            "/",
            "/command-center",
            "/customers",
            "/merchandise",
            "/baskets",
            "/forecast",
            "/households",
            "/data",
            "/households/example",
        ]:
            response = client.get(path, headers={"Accept": "text/html"})
            assert response.status_code == 200
            assert response.text == '<div id="root"></div>'
        assert client.get("/assets/app.js").text == "console.log('app')"
        assert client.get("/api/v1/health").json()["status"] == "ok"
        assert "/api/v1/health" in client.get("/api/v1/openapi.json").json()["paths"]
        docs = client.get("/api/v1/docs")
        assert docs.status_code == 200
        assert client.get("/api/v1/admin").status_code == 401
        if environment is Environment.DEVELOPMENT:
            assert (
                "script-src https://cdn.jsdelivr.net 'unsafe-inline'"
                in docs.headers["Content-Security-Policy"]
            )
            response = client.get("/", headers={"Origin": "https://untrusted.example"})
            assert response.headers["X-Content-Type-Options"] == "nosniff"
            assert response.headers["X-Frame-Options"] == "DENY"
            assert response.headers["Referrer-Policy"] == "no-referrer"
            assert response.headers["Strict-Transport-Security"] == "max-age=31536000"
            assert "default-src 'self'" in response.headers["Content-Security-Policy"]
            assert "unsafe-inline" not in response.headers["Content-Security-Policy"]
            assert "Access-Control-Allow-Origin" not in response.headers
        for path in ["/api/missing", "/api/v1/missing", "/assets/missing.js"]:
            response = client.get(path, headers={"Accept": "text/html"})
            assert response.status_code == (401 if path.startswith("/api/v1/") else 404)
            assert "text/html" not in response.headers["content-type"]
        assert client.post("/api/v1/missing").status_code == 401


def test_configured_frontend_requires_a_built_index(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="index.html"):
        create_app(Settings(static_directory=tmp_path, _env_file=None))
