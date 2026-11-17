locals {
  sql_location = coalesce(var.sql_location, local.location)
}

# Create the SQL server with Entra-only authentication in the approved SQL region.
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

# Bootstrap provisions SQL identities separately. Each new image migrates inside Azure
# before the app revision changes; GitHub runners never connect directly to SQL.
resource "terraform_data" "database_migrations" {
  count = var.sql_allow_azure_services ? 1 : 0
  triggers_replace = [
    azapi_resource.database.id,
    var.app_image,
    filesha256("${path.module}/scripts/run_migrations.sh"),
  ]
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "bash infra/scripts/run_migrations.sh"
    environment = {
      RDI_RESOURCE_GROUP = local.resource_group_name
      RDI_MIGRATION_JOB  = "${var.name_prefix}-migrate"
      RDI_APP_IMAGE      = var.app_image
    }
  }
  depends_on = [azurerm_mssql_firewall_rule.azure_services]
}

moved {
  from = terraform_data.database_access
  to   = terraform_data.database_migrations
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
