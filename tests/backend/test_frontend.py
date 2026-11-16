from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from retail_api.config import Settings
from retail_api.main import create_app


def test_frontend_deep_links_and_api_share_one_origin(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text('<div id="root"></div>')
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets/app.js").write_text("console.log('app')")
    settings = Settings(static_directory=tmp_path, cors_origins=[], _env_file=None)
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
        assert client.get("/api/v1/docs").status_code == 200
        for path in ["/api/missing", "/api/v1/missing", "/assets/missing.js"]:
            response = client.get(path, headers={"Accept": "text/html"})
            assert response.status_code == 404
            assert "text/html" not in response.headers["content-type"]
        assert client.post("/api/v1/missing").status_code == 404


def test_configured_frontend_requires_a_built_index(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="index.html"):
        create_app(Settings(static_directory=tmp_path, _env_file=None))
