# Retail Decision Intelligence

React, TypeScript, Tailwind CSS, FastAPI, and Azure SQL.
React and FastAPI deploy together as one Azure Container App.

## Development

Requires Python 3.12, Node.js 24, uv 0.13.6, and Make.

```bash
make setup
make dev-api  # terminal 1
make dev-web  # terminal 2
```

Web: http://localhost:5173 · API docs: http://127.0.0.1:8000/api/v1/docs.
Optional local settings: copy `.env.example` to `.env`.
Run `make migrate` to initialize the local database.
`/api/v1/health` checks the process; `/api/v1/ready` checks SQL and migration status.

## Checks

```bash
make check      # contracts, lint, types, tests, build
make format     # format code
make contracts  # regenerate API types after API changes
```

## Container

```bash
docker build -t rdi .
docker run --rm -p 8000:8000 rdi
python scripts/smoke_deployment.py http://127.0.0.1:8000
```

## Infrastructure

Terraform 1.14.x: `infra/bootstrap/` manages the resource group and remote state;
`infra/` manages the app, Azure SQL, identity, and logs. Copy the provided
configuration examples before planning. Both configurations share one resource
group. The app runs in North Central US; SQL uses West US 3.
Apply saved plans; keep state and plans out of Git.
SQL uses managed identity. Run migrations separately as the SQL administrator;
the API identity needs only `SELECT` on `dbo.alembic_version` for this story.
SQL network access remains blocked until an egress rule is approved.
