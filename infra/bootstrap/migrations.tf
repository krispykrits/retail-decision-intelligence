# Run migrations inside Azure, using the existing deployment identity's SQL grants.
resource "azurerm_container_app_job" "migrations" {
  count                        = local.configure_ci
  name                         = "${var.name_prefix}-migrate"
  resource_group_name          = azurerm_resource_group.project.name
  location                     = azurerm_resource_group.project.location
  container_app_environment_id = data.azurerm_container_app.development[0].container_app_environment_id
  replica_timeout_in_seconds   = 300
  replica_retry_limit          = 0
  workload_profile_name        = "Consumption"
  tags                         = azurerm_resource_group.project.tags
  depends_on                   = [terraform_data.deployment_sql_access]

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.deployment[0].id]
  }

  # No schedule or idle replica; each deployment explicitly starts one execution.
  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  template {
    container {
      name    = "migrate"
      image   = data.azurerm_container_app.development[0].template[0].container[0].image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["python", "-m", "retail_api.migrate"]
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.deployment[0].client_id
      }
      env {
        name  = "RDI_SQL_SERVER"
        value = "${var.name_prefix}-sql-${var.sql_location}.database.windows.net"
      }
      env {
        name  = "RDI_SQL_DATABASE"
        value = "retail"
      }
    }
  }
}

# The workflow can execute this job, without creating jobs or changing SQL firewall rules.
resource "azurerm_role_assignment" "migration_operator" {
  count                = local.configure_ci
  scope                = azurerm_container_app_job.migrations[0].id
  role_definition_name = "Container Apps Jobs Operator"
  principal_id         = azurerm_user_assigned_identity.deployment[0].principal_id
}
