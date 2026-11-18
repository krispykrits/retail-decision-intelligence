# Enable once the development app and database exist; local needs no cloud identity.
variable "github_repository" {
  type        = string
  default     = null
  description = "Repository segment from GitHub's OIDC subject, including immutable IDs (owner@id/repo@id); null disables CI setup."
  validation {
    condition     = var.github_repository == null || var.name_prefix != null
    error_message = "Set name_prefix when enabling GitHub deployment."
  }
}

variable "name_prefix" {
  type    = string
  default = null
}

variable "sql_location" {
  type    = string
  default = "westus3"
}

locals {
  configure_ci = var.github_repository == null ? 0 : 1
}

data "azurerm_client_config" "current" {}

data "azurerm_container_app" "development" {
  count               = local.configure_ci
  name                = "${var.name_prefix}-app"
  resource_group_name = azurerm_resource_group.project.name
}

data "azurerm_user_assigned_identity" "api" {
  count               = local.configure_ci
  name                = "${var.name_prefix}-api"
  resource_group_name = azurerm_resource_group.project.name
}

# Keep deployment permissions separate from the API's runtime identity.
resource "azurerm_user_assigned_identity" "deployment" {
  count               = local.configure_ci
  name                = "${var.name_prefix}-deploy"
  resource_group_name = azurerm_resource_group.project.name
  location            = azurerm_resource_group.project.location
  tags                = azurerm_resource_group.project.tags
}

# GitHub also restricts the development environment to the main branch.
resource "azurerm_federated_identity_credential" "github" {
  count               = local.configure_ci
  name                = "github-development"
  resource_group_name = azurerm_resource_group.project.name
  parent_id           = azurerm_user_assigned_identity.deployment[0].id
  issuer              = "https://token.actions.githubusercontent.com"
  audience            = ["api://AzureADTokenExchange"]
  subject             = "repo:${var.github_repository}:environment:development"
}

# Read the infrastructure and manage the app, import job, its identity assignment, and state.
resource "azurerm_role_assignment" "deployment" {
  for_each = local.configure_ci == 0 ? {} : {
    read = {
      scope = azurerm_resource_group.project.id
      role  = "Reader"
    }
    app = {
      scope = data.azurerm_container_app.development[0].id
      role  = "Container Apps Contributor"
    }
    environment = {
      scope = data.azurerm_container_app.development[0].container_app_environment_id
      role  = "Container Apps Contributor"
    }
    jobs = {
      scope = azurerm_resource_group.project.id
      role  = "Container Apps Jobs Contributor"
    }
    identity = {
      scope = data.azurerm_user_assigned_identity.api[0].id
      role  = "Managed Identity Operator"
    }
    state = {
      scope = azurerm_storage_account.state.id
      role  = "Storage Blob Data Contributor"
    }
  }
  scope                = each.value.scope
  role_definition_name = each.value.role
  principal_id         = azurerm_user_assigned_identity.deployment[0].principal_id
}

# The operator grants migration permissions once; the workflow never becomes SQL admin.
resource "terraform_data" "deployment_sql_access" {
  count = local.configure_ci
  triggers_replace = [
    azurerm_user_assigned_identity.deployment[0].client_id,
    filesha256("${path.module}/../scripts/configure_sql.py"),
  ]
  provisioner "local-exec" {
    working_dir = "${path.module}/../.."
    command     = "uv run --project backend --locked python infra/scripts/configure_sql.py"
    environment = {
      AZURE_CLIENT_ID          = ""
      RDI_SQL_SERVER           = "${var.name_prefix}-sql-${var.sql_location}.database.windows.net"
      RDI_SQL_DATABASE         = "retail"
      RDI_API_NAME             = data.azurerm_user_assigned_identity.api[0].name
      RDI_API_CLIENT_ID        = data.azurerm_user_assigned_identity.api[0].client_id
      RDI_DEPLOYMENT_NAME      = azurerm_user_assigned_identity.deployment[0].name
      RDI_DEPLOYMENT_CLIENT_ID = azurerm_user_assigned_identity.deployment[0].client_id
    }
  }
}

# Copy these non-secret values to the GitHub development environment variables.
output "github_development_variables" {
  value = local.configure_ci == 0 ? {} : {
    AZURE_CLIENT_ID       = azurerm_user_assigned_identity.deployment[0].client_id
    AZURE_TENANT_ID       = data.azurerm_client_config.current.tenant_id
    AZURE_SUBSCRIPTION_ID = var.subscription_id
  }
}
