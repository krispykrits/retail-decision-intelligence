"""Verify the combined frontend/API deployment without credentials or database access."""

import argparse
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API_PREFIX = "/api/v1"
REQUEST_TIMEOUT_SECONDS = 30
UNTRUSTED_ORIGIN = "https://untrusted.example"
# Independent expectations for the deployed HTTP contract.
EXPECTED_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000",
}


def check_deployment(base_url: str, *, security: bool = False) -> None:
    base_url = base_url.rstrip("/")
    request = Request(f"{base_url}{API_PREFIX}/health", headers={"Origin": UNTRUSTED_ORIGIN})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        assert json.load(response)["status"] == "ok", "API health check failed"
        if security:
            for header, expected in EXPECTED_SECURITY_HEADERS.items():
                assert response.headers[header] == expected, f"Unexpected {header} policy"
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
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            html = response.read().decode()
            assert '<div id="root"></div>' in html, f"SPA deep link failed: {path}"
    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    assert scripts, "Built frontend JavaScript is missing"
    with urlopen(f"{base_url}{scripts[0]}", timeout=REQUEST_TIMEOUT_SECONDS) as response:
        assert "javascript" in response.headers["Content-Type"]
    denied_paths = {
        f"{API_PREFIX}/missing": 401,
        "/assets/missing.js": 404,
        f"{API_PREFIX}/admin": 401,
        f"{API_PREFIX}/me": 401,
        f"{API_PREFIX}/dashboard": 401,
    }
    with urlopen(
        f"{base_url}{API_PREFIX}/openapi.json", timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        paths = json.load(response)["paths"]
        assert {f"{API_PREFIX}/health", f"{API_PREFIX}/dashboard"} <= paths.keys()
    with urlopen(f"{base_url}{API_PREFIX}/docs", timeout=REQUEST_TIMEOUT_SECONDS) as response:
        assert "SwaggerUIBundle" in response.read().decode()
        if security:
            assert (
                "script-src https://cdn.jsdelivr.net 'unsafe-inline'"
                in response.headers["Content-Security-Policy"]
            )
    for path, expected_status in denied_paths.items():
        try:
            urlopen(
                Request(f"{base_url}{path}", headers={"Accept": "text/html"}),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except HTTPError as error:
            assert error.code == expected_status, f"Unexpected response for {path}: {error.code}"
        else:
            raise AssertionError(f"Missing endpoint returned frontend HTML: {path}")
    print("Deployment smoke passed: one origin, API health, SPA routes, assets and access denial.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Container or Azure HTTPS base URL")
    parser.add_argument(
        "--security", action="store_true", help="Verify the development security baseline"
    )
    args = parser.parse_args()
    check_deployment(args.url, security=args.security)
