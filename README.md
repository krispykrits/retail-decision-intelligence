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
| `infra/` | Terraform infrastructure and state bootstrap |
| `ml/`, `docs/` | Reserved for later stories |

## Deployment target

One Azure Container App serves the built React frontend and FastAPI over the
same HTTPS address. It scales to zero and connects to Azure SQL. All project
resources share one resource group in North Central US.

```bash
docker build -t rdi .
docker run --rm -p 8000:8000 rdi
python scripts/smoke_deployment.py http://127.0.0.1:8000
```

## Azure infrastructure

Terraform 1.14.x and Azure CLI are required. All resources, including state
storage, share one resource group. Confirm the subscription, permitted regions,
Container Apps quota, and SQL free-tier eligibility before applying. Register
`Microsoft.App`, `Microsoft.Web`, `Microsoft.Sql`, `Microsoft.Storage`,
`Microsoft.OperationalInsights`, and `Microsoft.ManagedIdentity` if needed.

Copy the examples to `infra/bootstrap/terraform.tfvars`, `infra/terraform.tfvars`,
and `infra/backend.hcl`; fill in your subscription, regions, identities, names,
and the project's published combined image digest. The bootstrap state operator must
be the signed-in identity and have permission to create resource-scoped roles.

```bash
az login
az account set --subscription <subscription-id>
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=infra/bootstrap apply bootstrap.tfplan

# Protect the bootstrap state in the same storage account before proceeding.
cp infra/bootstrap/remote.tf.example infra/bootstrap/remote.tf
terraform -chdir=infra/bootstrap init -migrate-state \
  -backend-config=../backend.hcl -backend-config=key=bootstrap.tfstate
terraform -chdir=infra init \
  -backend-config=backend.hcl -backend-config=key=application.tfstate
terraform -chdir=infra plan -out=application.tfplan
terraform -chdir=infra apply application.tfplan
```

Verify remote state migration before deleting local state backups. Blob state
uses Entra authorization, locking, versioning, and seven-day soft delete. Keep
state and saved plans private; provider state can contain deployment credentials.

SQL starts closed. Copy `terraform -chdir=infra output app_outbound_ipv4_addresses`
into `sql_allowed_ipv4_addresses`, review, and apply again. Only IPs reported by
the API are accepted; broad Azure-service access is forbidden. Refresh this list
after environment changes because outbound IPs can change. SQL uses Entra-only
authentication and TLS 1.2; database grants and API integration are story #3.

The API scales to zero; SQL uses its free allowance with
automatic pause at exhaustion. State storage and logs remain metered; a regional
cost estimate and live validation are required before deployment. Application authentication is handled by the following stories.

For a disposable environment, review a destroy plan, then apply it:

```bash
terraform -chdir=infra plan -destroy -out=destroy.tfplan
terraform -chdir=infra apply destroy.tfplan
```

This removes application resources
and database data; the protected group and state storage remain. Test this only
with disposable data. Do not delete the shared resource group to stop the app.
