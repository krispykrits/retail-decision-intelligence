.PHONY: setup local-account dev-api dev-web migrate contracts contracts-check format lint test build check smoke

setup:
	uv sync --project backend --locked
	npm ci --prefix frontend

local-account:
	uv run --project backend --locked python -m retail_api.accounts.local

dev-api:
	uv run --project backend uvicorn retail_api.main:app --reload --host 127.0.0.1 --port 8000

dev-web:
	npm run dev --prefix frontend

migrate:
	uv run --project backend python -m retail_api.migrate

contracts:
	uv run --project backend python scripts/export_openapi.py
	npm run generate:api --prefix frontend

contracts-check:
	uv run --project backend python scripts/export_openapi.py --check
	npm run check:api --prefix frontend

format:
	uv run --project backend ruff check --fix --config backend/pyproject.toml backend/src ml tests/backend scripts infra/scripts
	uv run --project backend ruff format --config backend/pyproject.toml backend/src ml tests/backend scripts infra/scripts
	npm run format --prefix frontend

lint:
	uv run --project backend ruff check --config backend/pyproject.toml backend/src ml tests/backend scripts infra/scripts
	uv run --project backend ruff format --check --config backend/pyproject.toml backend/src ml tests/backend scripts infra/scripts
	uv run --project backend mypy --config-file backend/pyproject.toml backend/src ml/customer_models
	npm run format:check --prefix frontend
	npm run lint --prefix frontend

test:
	uv run --project backend pytest -c backend/pyproject.toml
	npm test --prefix frontend

build:
	npm run build --prefix frontend

check: contracts-check lint test build

smoke: setup check
	uv run --project backend python scripts/smoke.py
