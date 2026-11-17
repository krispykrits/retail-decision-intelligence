data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "project" {
  name = var.resource_group_name
}

locals {
  resource_group_name = data.azurerm_resource_group.project.name
  location            = data.azurerm_resource_group.project.location
  tags                = data.azurerm_resource_group.project.tags
}

resource "azurerm_log_analytics_workspace" "logs" {
  name                = "${var.name_prefix}-logs"
  resource_group_name = local.resource_group_name
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.1
  tags                = local.tags
}

resource "azurerm_container_app_environment" "app" {
  name                       = "${var.name_prefix}-env"
  resource_group_name        = local.resource_group_name
  location                   = local.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

resource "azurerm_user_assigned_identity" "api" {
  name                = "${var.name_prefix}-api"
  resource_group_name = local.resource_group_name
  location            = local.location
  tags                = local.tags
}

resource "azurerm_container_app" "app" {
  depends_on                   = [terraform_data.database_access]
  name                         = "${var.name_prefix}-app"
  resource_group_name          = local.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.app.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  # Azure omits these Single-mode/default fields from read responses.
  lifecycle {
    ignore_changes = [
      ingress[0].traffic_weight,
      template[0].cooldown_period_in_seconds,
      template[0].polling_interval_in_seconds,
    ]
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  ingress {
    external_enabled           = true
    allow_insecure_connections = false
    target_port                = 8000
    transport                  = "http"
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1
    http_scale_rule {
      name                = "http"
      concurrent_requests = "20"
    }
    container {
      name   = "api"
      image  = var.app_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "RDI_CORS_ORIGINS"
        value = "[]"
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

      liveness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/api/v1/health"
      }
      readiness_probe {
        transport               = "HTTP"
        port                    = 8000
        path                    = "/api/v1/ready"
        timeout                 = 10
        interval_seconds        = 30
        failure_count_threshold = 10
      }
      startup_probe {
        transport               = "HTTP"
        port                    = 8000
        path                    = "/api/v1/health"
        interval_seconds        = 5
        failure_count_threshold = 30
      }
    }
  }
}
