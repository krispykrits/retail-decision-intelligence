"""Verify the combined frontend/API deployment without credentials or database access."""

import argparse
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def check_deployment(base_url: str, *, security: bool = False) -> None:
    base_url = base_url.rstrip("/")
    request = Request(f"{base_url}/api/v1/health", headers={"Origin": "https://untrusted.example"})
    with urlopen(request, timeout=30) as response:
        assert json.load(response)["status"] == "ok", "API health check failed"
        if security:
            assert response.headers["X-Content-Type-Options"] == "nosniff"
            assert response.headers["X-Frame-Options"] == "DENY"
            assert response.headers["Referrer-Policy"] == "no-referrer"
            assert response.headers["Strict-Transport-Security"] == "max-age=31536000"
            assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
            assert "Access-Control-Allow-Origin" not in response.headers
    for path in [
        "/",
        "/command-center",
        "/customers",
        "/merchandise",
        "/baskets",
        "/forecast",
        "/households",
        "/data",
    ]:
        request = Request(f"{base_url}{path}", headers={"Accept": "text/html"})
        with urlopen(request, timeout=30) as response:
            html = response.read().decode()
            assert '<div id="root"></div>' in html, f"SPA deep link failed: {path}"
    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    assert scripts, "Built frontend JavaScript is missing"
    with urlopen(f"{base_url}{scripts[0]}", timeout=30) as response:
        assert "javascript" in response.headers["Content-Type"]
    missing_paths = ["/api/v1/missing", "/assets/missing.js", "/api/v1/admin"]
    with urlopen(f"{base_url}/api/v1/openapi.json", timeout=30) as response:
        assert "/api/v1/health" in json.load(response)["paths"]
    with urlopen(f"{base_url}/api/v1/docs", timeout=30) as response:
        assert "SwaggerUIBundle" in response.read().decode()
        if security:
            assert (
                "script-src https://cdn.jsdelivr.net 'unsafe-inline'"
                in response.headers["Content-Security-Policy"]
            )
    for path in missing_paths:
        try:
            urlopen(Request(f"{base_url}{path}", headers={"Accept": "text/html"}), timeout=30)
        except HTTPError as error:
            assert error.code == 404, f"Unexpected response for {path}: {error.code}"
        else:
            raise AssertionError(f"Missing endpoint returned frontend HTML: {path}")
    print("Deployment smoke passed: one origin, API health, SPA deep links, assets and 404s.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Container or Azure HTTPS base URL")
    parser.add_argument(
        "--security", action="store_true", help="Verify the development security baseline"
    )
    args = parser.parse_args()
    check_deployment(args.url, security=args.security)
