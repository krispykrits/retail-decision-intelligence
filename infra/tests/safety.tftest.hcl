mock_provider "azurerm" {
  override_during = plan
  mock_data "azurerm_client_config" {
    defaults = { tenant_id = "11111111-1111-1111-1111-111111111111" }
  }
  mock_data "azurerm_resource_group" {
    defaults = {
      name     = "rg-rdi-test"
      location = "eastus"
      tags     = { project = "retail-decision-intelligence" }
    }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.OperationalInsights/workspaces/rdi-logs" }
  }
  mock_resource "azurerm_container_app_environment" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/managedEnvironments/rdi-env" }
  }
  mock_resource "azurerm_user_assigned_identity" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.ManagedIdentity/userAssignedIdentities/rdi-api" }
  }
  mock_resource "azurerm_mssql_server" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Sql/servers/rdi-sql" }
  }
  mock_resource "azurerm_container_app" {
    defaults = { outbound_ip_addresses = ["203.0.113.10"] }
  }
}

mock_provider "azapi" {}

variables {
  subscription_id         = "11111111-1111-1111-1111-111111111111"
  resource_group_name     = "rg-rdi-test"
  name_prefix             = "rdi-test"
  static_web_app_location = "eastus2"
  api_image               = "ghcr.io/example/rdi@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  sql_admin_object_id     = "22222222-2222-2222-2222-222222222222"
  sql_admin_login         = "test-admin"
}

run "single_group_and_cost_controls" {
  command = plan

  assert {
    condition = alltrue([
      azurerm_static_web_app.web.resource_group_name == var.resource_group_name,
      azurerm_log_analytics_workspace.logs.resource_group_name == var.resource_group_name,
      azurerm_container_app_environment.app.resource_group_name == var.resource_group_name,
      azurerm_user_assigned_identity.api.resource_group_name == var.resource_group_name,
      azurerm_container_app.api.resource_group_name == var.resource_group_name,
      azurerm_mssql_server.sql.resource_group_name == var.resource_group_name,
    ])
    error_message = "Every top-level Azure resource must use the single project resource group."
  }
  assert {
    condition = (
      azurerm_container_app.api.template[0].min_replicas == 0 &&
      azurerm_container_app.api.template[0].max_replicas == 1 &&
      azurerm_static_web_app.web.sku_tier == "Free" &&
      azapi_resource.database.body.properties.useFreeLimit &&
      azapi_resource.database.body.properties.freeLimitExhaustionBehavior == "AutoPause"
    )
    error_message = "Scale-to-zero, Free SWA and SQL free-limit auto-pause must remain enabled."
  }
  assert {
    condition = (
      length(azurerm_mssql_firewall_rule.api) == 0 &&
      azurerm_mssql_server.sql.azuread_administrator[0].azuread_authentication_only &&
      !azurerm_container_app.api.ingress[0].allow_insecure_connections
    )
    error_message = "A fresh deployment must deny SQL network access and require Entra/TLS."
  }
}

run "reject_broad_azure_access" {
  command = plan
  variables {
    sql_allowed_ipv4_addresses = ["0.0.0.0"]
  }
  expect_failures = [var.sql_allowed_ipv4_addresses]
}

run "reject_mutable_image" {
  command = plan
  variables {
    api_image = "ghcr.io/example/rdi:latest"
  }
  expect_failures = [var.api_image]
}

run "allow_reported_api_address" {
  command = plan
  variables {
    sql_allowed_ipv4_addresses = ["203.0.113.10"]
  }
  assert {
    condition = (
      azurerm_mssql_firewall_rule.api["203.0.113.10"].start_ip_address ==
      azurerm_mssql_firewall_rule.api["203.0.113.10"].end_ip_address
    )
    error_message = "The firewall must allow individual addresses, never ranges."
  }
}

run "reject_unrelated_address" {
  command = plan
  variables {
    sql_allowed_ipv4_addresses = ["203.0.113.11"]
  }
  expect_failures = [azurerm_mssql_firewall_rule.api]
}
