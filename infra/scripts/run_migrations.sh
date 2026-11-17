#!/usr/bin/env bash
set -euo pipefail

# Override only this execution's image; Terraform owns the job configuration.
execution=$(az containerapp job start --name "$RDI_MIGRATION_JOB" \
  --resource-group "$RDI_RESOURCE_GROUP" --container-name migrate \
  --image "$RDI_APP_IMAGE" --query name --output tsv)
[[ -n "$execution" ]]
echo "Migration execution: $execution"

# Block the app revision update until migrations succeed; never replay a failed migration.
for ((attempt=0; attempt<60; attempt++)); do
  status=$(az containerapp job execution show --name "$RDI_MIGRATION_JOB" \
    --resource-group "$RDI_RESOURCE_GROUP" --job-execution-name "$execution" \
    --query properties.status --output tsv)
  case "$status" in
    Succeeded) echo "SQL migrations succeeded."; exit 0 ;;
    Failed|Stopped|Canceled) echo "Migration execution $execution ended: $status" >&2; exit 1 ;;
  esac
  sleep 10
done

# Stop a timed-out execution so another deployment cannot overlap with it.
az containerapp job stop --name "$RDI_MIGRATION_JOB" \
  --resource-group "$RDI_RESOURCE_GROUP" --job-execution-name "$execution"
echo "Migration execution $execution timed out." >&2
exit 1
