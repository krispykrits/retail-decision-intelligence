"""Verify the combined frontend/API deployment without credentials or database access."""

import argparse
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def check_deployment(base_url: str) -> None:
    base_url = base_url.rstrip("/")
    with urlopen(f"{base_url}/api/v1/health", timeout=30) as response:
        assert json.load(response)["status"] == "ok", "API health check failed"
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
    for path in ["/api/v1/missing", "/assets/missing.js"]:
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
    check_deployment(parser.parse_args().url)
