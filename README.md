# Retail Decision Intelligence

React, TypeScript, Tailwind CSS, FastAPI, and Azure SQL.

## Development

Requires Python 3.12, Node.js 24, uv 0.13.6, and Make (Linux, macOS, or WSL).

```bash
make setup
make dev-api  # terminal 1
make dev-web  # terminal 2
```

Web: http://localhost:5173 · API docs: http://127.0.0.1:8000/api/v1/docs.
Optional local settings: copy `.env.example` to `.env`.

## Commands

| Command | Purpose |
| --- | --- |
| `make smoke` | Install, check, build, and verify both local servers |
| `make check` | Contracts, formatting, lint, types, tests, and build |
| `make format` | Format Python, frontend code, and Tailwind classes |
| `make contracts` | Regenerate OpenAPI and frontend API types |

## Structure

| Path | Contents |
| --- | --- |
| `frontend/src/app/` | Routing and navigation |
| `frontend/src/components/` | Layout and shared UI |
| `frontend/src/pages/` | Pages |
| `frontend/src/api/` | Typed client and generated contract |
| `backend/src/retail_api/` | API routes, configuration, and database setup |
| `tests/`, `scripts/` | Backend tests and development commands |
| `infra/`, `ml/`, `docs/` | Reserved for later stories |

## Deployment target

```mermaid
flowchart TD
  Browser["Browser"] --> SPA["React · Azure Static Web Apps"]
  SPA --> API["FastAPI · Azure Container Apps"]
  SPA --> Identity["Microsoft Entra External ID"]
  API --> SQL["Azure SQL"]
```
