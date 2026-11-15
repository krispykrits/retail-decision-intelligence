"""Exercise the real API, SPA deep links, and Vite proxy on temporary local ports."""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def wait_for(url: str, processes: list[subprocess.Popen[bytes]]) -> bytes:
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if any(process.poll() is not None for process in processes):
            raise RuntimeError("A smoke-test server exited before becoming ready")
        try:
            with urlopen(url, timeout=1) as response:
                return response.read()
        except (URLError, TimeoutError, ConnectionError):
            time.sleep(0.1)
    raise TimeoutError(f"Server did not become ready: {url}")


def main() -> None:
    api_port, web_port = free_port(), free_port()
    while web_port == api_port:
        web_port = free_port()
    api_url = f"http://127.0.0.1:{api_port}"
    web_url = f"http://127.0.0.1:{web_port}"
    env = {**os.environ, "RDI_API_PROXY_TARGET": api_url}
    processes: list[subprocess.Popen[bytes]] = []
    with tempfile.TemporaryFile() as logs:
        try:
            processes.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "retail_api.main:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(api_port),
                    ],
                    cwd=ROOT,
                    env=env,
                    stdout=logs,
                    stderr=logs,
                )
            )
            processes.append(
                subprocess.Popen(
                    [
                        "node",
                        str(ROOT / "frontend/node_modules/vite/bin/vite.js"),
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(web_port),
                        "--strictPort",
                    ],
                    cwd=ROOT / "frontend",
                    env=env,
                    stdout=logs,
                    stderr=logs,
                )
            )
            direct = json.loads(wait_for(f"{api_url}/api/v1/health", processes))
            proxied = json.loads(wait_for(f"{web_url}/api/v1/health", processes))
            if direct != proxied or direct.get("status") != "ok":
                raise RuntimeError("The frontend proxy did not reach the healthy API")
            for route in [
                "command-center",
                "customers",
                "merchandise",
                "baskets",
                "forecast",
                "households",
                "data",
            ]:
                html = wait_for(f"{web_url}/{route}", processes).decode("utf-8")
                if '<div id="root"></div>' not in html:
                    raise RuntimeError(f"SPA deep link failed: {route}")
            print("Smoke passed: API health, frontend proxy, and all seven SPA deep links.")
        except Exception:
            logs.seek(0)
            print(logs.read().decode("utf-8", errors="replace"), file=sys.stderr)
            raise
        finally:
            for process in reversed(processes):
                process.terminate()
            for process in processes:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
