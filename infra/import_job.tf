# Confirm the operator bootstrap exists before Terraform can update the app.
data "azapi_resource" "import_storage" {
  for_each = var.import_storage_account == null ? {} : {
    blobs = { type = "blobServices/containers", path = "blobServices/default/containers/csv-imports" }
    queue = { type = "queueServices/queues", path = "queueServices/default/queues/csv-imports" }
  }

  type        = "Microsoft.Storage/storageAccounts/${each.value.type}@2023-05-01"
  resource_id = "${data.azurerm_resource_group.project.id}/providers/Microsoft.Storage/storageAccounts/${var.import_storage_account}/${each.value.path}"
}

# The queue starts jobs as needed. The web app can continue scaling to zero.
resource "azurerm_container_app_job" "imports" {
  count                        = var.import_storage_account == null ? 0 : 1
  name                         = "${var.name_prefix}-imports"
  resource_group_name          = local.resource_group_name
  location                     = local.location
  container_app_environment_id = azurerm_container_app_environment.app.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 0
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  event_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
    scale {
      min_executions              = 0
      max_executions              = 1
      polling_interval_in_seconds = 15
      rules {
        name             = "csv-imports"
        custom_rule_type = "azure-queue"
        identity_id      = azurerm_user_assigned_identity.api.id
        metadata = {
          accountName         = var.import_storage_account
          queueName           = "csv-imports"
          queueLength         = "1"
          queueLengthStrategy = "visibleonly"
        }
      }
    }
  }

  template {
    container {
      name    = "import"
      image   = var.app_image
      command = ["python", "-m", "retail_api.imports.worker"]
      cpu     = 0.5
      memory  = "1Gi"

      env {
        name  = "RDI_IMPORT_STORAGE_ACCOUNT"
        value = var.import_storage_account
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.api.client_id
      }
      env {
        name  = "RDI_SQL_SERVER"
        value = azurerm_mssql_server.sql.fully_qualified_domain_name
      }
      env {
        name  = "RDI_SQL_DATABASE"
        value = azapi_resource.database.name
      }
    }
  }

  depends_on = [terraform_data.database_access, data.azapi_resource.import_storage]
}
