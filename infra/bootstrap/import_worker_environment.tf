# Mark the worker environment explicitly. The web environment stays on Express.
resource "azapi_resource" "import_worker_environment" {
  count     = local.configure_ci
  type      = "Microsoft.App/managedEnvironments@2026-07-01"
  name      = "${var.name_prefix}-worker-env"
  parent_id = azurerm_resource_group.project.id
  location  = azurerm_resource_group.project.location
  tags      = azurerm_resource_group.project.tags
  # Azure accepts this API version, which is newer than AzAPI's bundled schema.
  schema_validation_enabled = false
  body = {
    properties = {
      environmentMode = "WorkloadProfiles"
      workloadProfiles = [{
        name                = "Consumption"
        workloadProfileType = "Consumption"
      }]
      appLogsConfiguration = { destination = "azure-monitor" }
    }
  }
}

data "azurerm_log_analytics_workspace" "imports" {
  count               = local.configure_ci
  name                = "${var.name_prefix}-logs"
  resource_group_name = azurerm_resource_group.project.name
}

resource "azurerm_monitor_diagnostic_setting" "imports" {
  count                          = local.configure_ci
  name                           = "import-worker-logs"
  target_resource_id             = azapi_resource.import_worker_environment[0].id
  log_analytics_workspace_id     = data.azurerm_log_analytics_workspace.imports[0].id
  log_analytics_destination_type = "Dedicated"

  enabled_log {
    category = "ContainerAppConsoleLogs"
  }

  enabled_log {
    category = "ContainerAppSystemLogs"
  }
}
