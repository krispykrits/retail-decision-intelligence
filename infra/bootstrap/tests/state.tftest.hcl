mock_provider "azurerm" {
  override_during = plan
  mock_resource "azurerm_storage_account" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate" }
  }
  mock_data "azurerm_container_app" {
    defaults = {
      id                           = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/containerApps/rdi-test-app"
      container_app_environment_id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/managedEnvironments/rdi-test-env"
      template                     = [{ container = [{ image = "ghcr.io/example/retail@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] }]
    }
  }
  mock_data "azurerm_user_assigned_identity" {
    defaults = {
      id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.ManagedIdentity/userAssignedIdentities/rdi-test-api"
    }
  }
  mock_resource "azurerm_container_app_job" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/jobs/rdi-test-migrate" }
  }
}

variables {
  subscription_id          = "11111111-1111-1111-1111-111111111111"
  resource_group_name      = "rg-rdi-test"
  location                 = "eastus"
  state_storage_name       = "rditeststate"
  state_operator_object_id = "22222222-2222-2222-2222-222222222222"
  github_repository        = "example@123/retail@456"
  name_prefix              = "rdi-test"
}

run "private_state_in_project_group" {
  command = plan
  assert {
    condition = (
      azurerm_storage_account.state.resource_group_name == var.resource_group_name &&
      !azurerm_storage_account.state.shared_access_key_enabled &&
      !azurerm_storage_account.state.allow_nested_items_to_be_public &&
      azurerm_storage_container.state.container_access_type == "private" &&
      azurerm_storage_account.state.blob_properties[0].versioning_enabled &&
      azurerm_storage_account.state.blob_properties[0].delete_retention_policy[0].days == 7
    )
    error_message = "State must stay private, recoverable, keyless, and in the project resource group."
  }
  assert {
    condition = (
      azurerm_role_assignment.state_operator.scope == azurerm_storage_account.state.id &&
      azurerm_role_assignment.state_operator.role_definition_name == "Storage Blob Data Contributor"
    )
    error_message = "State access must be scoped to the state storage account."
  }
  assert {
    condition = (
      azurerm_container_app_job.migrations[0].resource_group_name == var.resource_group_name &&
      azurerm_container_app_job.migrations[0].identity[0].identity_ids == toset([azurerm_user_assigned_identity.deployment[0].id]) &&
      azurerm_container_app_job.migrations[0].replica_retry_limit == 0 &&
      azurerm_role_assignment.migration_operator[0].scope == azurerm_container_app_job.migrations[0].id &&
      azurerm_role_assignment.migration_operator[0].role_definition_name == "Container Apps Jobs Operator"
    )
    error_message = "Migrations must use the deployment identity in the project group, with job-scoped execution access and no migration replay."
  }
  assert {
    condition = (
      azurerm_federated_identity_credential.github[0].subject == "repo:example@123/retail@456:environment:development" &&
      alltrue([for grant in azurerm_role_assignment.deployment : !contains(["Owner", "Contributor"], grant.role_definition_name)])
    )
    error_message = "Deployment must use development-only federation without broad Owner/Contributor grants."
  }
}
