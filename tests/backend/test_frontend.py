from pathlib import Path
from typing import Literal

import pytest
from fastapi.testclient import TestClient

from retail_api.config import Settings
from retail_api.main import create_app


@pytest.mark.parametrize("environment", ["local", "development"])
def test_frontend_deep_links_and_api_share_one_origin(
    tmp_path: Path, environment: Literal["local", "development"]
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
        if environment == "local":
            assert "/api/v1/health" in client.get("/api/v1/openapi.json").json()["paths"]
            assert client.get("/api/v1/docs").status_code == 200
        else:
            for path in ["/api/v1/docs", "/api/v1/openapi.json", "/api/v1/admin"]:
                assert client.get(path).status_code == 404
            response = client.get("/", headers={"Origin": "https://untrusted.example"})
            assert response.headers["X-Content-Type-Options"] == "nosniff"
            assert response.headers["X-Frame-Options"] == "DENY"
            assert response.headers["Referrer-Policy"] == "no-referrer"
            assert response.headers["Strict-Transport-Security"] == "max-age=31536000"
            assert "default-src 'self'" in response.headers["Content-Security-Policy"]
            assert "Access-Control-Allow-Origin" not in response.headers
        for path in ["/api/missing", "/api/v1/missing", "/assets/missing.js"]:
            response = client.get(path, headers={"Accept": "text/html"})
            assert response.status_code == 404
            assert "text/html" not in response.headers["content-type"]
        assert client.post("/api/v1/missing").status_code == 404


def test_configured_frontend_requires_a_built_index(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="index.html"):
        create_app(Settings(static_directory=tmp_path, _env_file=None))
