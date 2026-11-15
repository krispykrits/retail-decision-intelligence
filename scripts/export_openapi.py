"""Export the backend contract without starting a server."""

import argparse
import json
from pathlib import Path

from retail_api.main import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the saved schema is stale")
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / "backend" / "openapi.json"
    content = json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            parser.exit(1, "OpenAPI schema is stale. Run make contracts.\n")
    else:
        target.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
