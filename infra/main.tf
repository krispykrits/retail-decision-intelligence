# Read the deployment tenant for the SQL Entra administrator.
data "azurerm_client_config" "current" {}

# Reuse the bootstrap resource group for every application resource.
data "azurerm_resource_group" "project" {
  name = var.resource_group_name
}

locals {
  resource_group_name = data.azurerm_resource_group.project.name
  location            = data.azurerm_resource_group.project.location
  tags                = data.azurerm_resource_group.project.tags
}

# Retain application logs with bounded retention and a daily ingestion cap.
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "${var.name_prefix}-logs"
  resource_group_name = local.resource_group_name
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.1
  tags                = local.tags
}

# Run on Consumption without a custom VNet or its additional managed resource group.
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

# Give the API an Azure identity instead of storing database credentials.
resource "azurerm_user_assigned_identity" "api" {
  name                = "${var.name_prefix}-api"
  resource_group_name = local.resource_group_name
  location            = local.location
  tags                = local.tags
}

# Deploy the combined React/FastAPI image after database setup completes.
resource "azurerm_container_app" "app" {
  depends_on                   = [terraform_data.database_migrations]
  name                         = "${var.name_prefix}-app"
  resource_group_name          = local.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.app.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  # Azure omits these Single-mode/default fields from read responses.
  # Probe transports stay managed so future updates preserve HTTP checks.
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

  # Accept public HTTPS traffic and forward it to the container's HTTP port.
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

  # Scale idle development workloads to zero and cap capacity at one replica.
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

      # UI and API share one origin; database authentication uses the attached identity.
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

      # Restart for a failed API process, not for an unavailable database.
      liveness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/api/v1/health"
      }
      # Route traffic only after SQL connectivity and migration status are verified.
      readiness_probe {
        transport               = "HTTP"
        port                    = 8000
        path                    = "/api/v1/ready"
        success_count_threshold = 1
        timeout                 = 10
        interval_seconds        = 30
        failure_count_threshold = 10
      }
      # Allow API startup to finish before liveness checks can restart it.
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
