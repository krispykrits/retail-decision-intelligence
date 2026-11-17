locals {
  sql_location = coalesce(var.sql_location, local.location)
}

resource "azurerm_mssql_server" "sql" {
  name                                 = "${var.name_prefix}-sql-${local.sql_location}"
  resource_group_name                  = local.resource_group_name
  location                             = local.sql_location
  version                              = "12.0"
  minimum_tls_version                  = "1.2"
  public_network_access_enabled        = true
  outbound_network_restriction_enabled = true
  tags                                 = local.tags

  azuread_administrator {
    login_username              = var.sql_admin_login
    object_id                   = var.sql_admin_object_id
    tenant_id                   = data.azurerm_client_config.current.tenant_id
    azuread_authentication_only = true
  }
}

# Optional individual operator/client addresses.
resource "azurerm_mssql_firewall_rule" "api" {
  for_each         = var.sql_allowed_ipv4_addresses
  name             = "api-${replace(each.value, ".", "-")}"
  server_id        = azurerm_mssql_server.sql.id
  start_ip_address = each.value
  end_ip_address   = each.value

}

# Opt-in development access: Azure resources still require Entra SQL permissions.
resource "azurerm_mssql_firewall_rule" "azure_services" {
  count            = var.sql_allow_azure_services ? 1 : 0
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.sql.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Runs configure_sql.py as the SQL administrator on creation or tracked changes.
# Unchanged applies skip it; failed provisioning is retried on the next apply.
# This is deployment setup, never API startup or request handling.
resource "terraform_data" "database_access" {
  count = var.sql_allow_azure_services ? 1 : 0
  triggers_replace = [
    azapi_resource.database.id,
    azurerm_user_assigned_identity.api.client_id,
    filesha256("${path.module}/scripts/configure_sql.py"),
    sha256(join("", [for file in sort(fileset("${path.module}/../backend/src/retail_api/migrations", "**/*.py")) : filesha256("${path.module}/../backend/src/retail_api/migrations/${file}")])),
  ]
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "uv run --project backend --locked python infra/scripts/configure_sql.py"
    environment = {
      AZURE_CLIENT_ID   = ""
      RDI_SQL_SERVER    = azurerm_mssql_server.sql.fully_qualified_domain_name
      RDI_SQL_DATABASE  = azapi_resource.database.name
      RDI_API_NAME      = azurerm_user_assigned_identity.api.name
      RDI_API_CLIENT_ID = azurerm_user_assigned_identity.api.client_id
    }
  }
  depends_on = [azurerm_mssql_firewall_rule.azure_services]
}

# AzAPI exposes the free-tier properties unavailable in azurerm_mssql_database.
# Refuse paid fallback: an ineligible subscription/region must fail deployment.
resource "azapi_resource" "database" {
  type      = "Microsoft.Sql/servers/databases@2023-08-01"
  name      = "retail"
  parent_id = azurerm_mssql_server.sql.id
  location  = local.sql_location
  tags      = local.tags
  body = {
    sku = {
      name     = "GP_S_Gen5"
      tier     = "GeneralPurpose"
      family   = "Gen5"
      capacity = 2
    }
    properties = {
      createMode                       = "Default"
      maxSizeBytes                     = 34359738368
      requestedBackupStorageRedundancy = "Local"
      useFreeLimit                     = true
      freeLimitExhaustionBehavior      = "AutoPause"
    }
  }
}
