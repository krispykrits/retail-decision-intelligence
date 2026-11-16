locals {
  sql_location = coalesce(var.sql_location, local.location)
}

resource "azurerm_mssql_server" "sql" {
  name                                 = "${var.name_prefix}-sql"
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

# Keep SQL closed on the first apply. After retrieving the API egress IPs,
# explicitly allow only those individual addresses. Azure may change these IPs;
# refresh and review the allowlist after environment changes.
resource "azurerm_mssql_firewall_rule" "api" {
  for_each         = var.sql_allowed_ipv4_addresses
  name             = "api-${replace(each.value, ".", "-")}"
  server_id        = azurerm_mssql_server.sql.id
  start_ip_address = each.value
  end_ip_address   = each.value

  lifecycle {
    precondition {
      condition     = contains(azurerm_container_app.app.outbound_ip_addresses, each.value)
      error_message = "Only outbound IP addresses reported by this project API may access SQL."
    }
  }
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
