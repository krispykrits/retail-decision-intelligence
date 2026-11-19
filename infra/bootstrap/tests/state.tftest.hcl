mock_provider "azurerm" {
  override_during = plan
  mock_resource "azurerm_resource_group" {
    defaults = { id = "/subscriptions/11111111-1111-1111-111111111111/resourceGroups/rg-rdi-test" }
  }
  mock_resource "azurerm_storage_account" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate" }
  }
  mock_resource "azurerm_storage_container" {
    defaults = { resource_manager_id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate/blobServices/default/containers/tfstate" }
  }
  mock_resource "azurerm_storage_queue" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate/queueServices/default/queues/csv-imports" }
  }
  mock_data "azurerm_log_analytics_workspace" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.OperationalInsights/workspaces/rdi-test-logs" }
  }
  mock_data "azurerm_container_app" {
    defaults = {
      id                           = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/containerApps/rdi-test-app"
      container_app_environment_id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/managedEnvironments/rdi-test-env"
      ingress                      = [{ fqdn = "rdi-test-app.example.test" }]
    }
  }
  mock_data "azurerm_user_assigned_identity" {
    defaults = {
      id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.ManagedIdentity/userAssignedIdentities/rdi-test-api"
    }
  }
}

mock_provider "azapi" {
  override_during = plan
  mock_resource "azapi_resource" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.App/managedEnvironments/rdi-test-worker-env" }
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
      azurerm_role_assignment.runner_access[0].scope == "${azurerm_resource_group.project.id}/providers/Microsoft.Sql/servers/rdi-test-sql-westus3" &&
      toset(azurerm_role_definition.runner_access[0].permissions[0].actions) == toset([
        "Microsoft.Sql/servers/firewallRules/read",
        "Microsoft.Sql/servers/firewallRules/write",
        "Microsoft.Sql/servers/firewallRules/delete",
      ])
    )
    error_message = "Runner access must be limited to firewall-rule operations on this project's SQL server."
  }
  assert {
    condition = (
      azurerm_federated_identity_credential.github[0].subject == "repo:example@123/retail@456:environment:development" &&
      alltrue([for grant in azurerm_role_assignment.deployment : !contains(["Owner", "Contributor"], grant.role_definition_name)]) &&
      azurerm_role_assignment.deployment["state"].scope == azurerm_storage_container.state.resource_manager_id
    )
    error_message = "Deployment must use development-only federation without broad Owner/Contributor grants."
  }
}

run "private_model_artifact_container" {
  command = plan

  variables {
    model_artifact_publisher_object_id = "33333333-3333-3333-3333-333333333333"
  }

  override_resource {
    override_during = plan
    target          = azurerm_storage_account.state
    values = {
      primary_blob_endpoint = "https://rditeststate.blob.core.windows.net/"
      id                    = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate"
    }
  }

  override_resource {
    override_during = plan
    target          = azurerm_storage_container.model_artifacts[0]
    values = {
      resource_manager_id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate/blobServices/default/containers/model-artifacts"
    }
  }

  assert {
    condition = (
      azurerm_storage_container.model_artifacts[0].container_access_type == "private" &&
      azurerm_storage_container.model_artifacts[0].storage_account_id == azurerm_storage_account.state.id &&
      output.model_artifact_container_url == "https://rditeststate.blob.core.windows.net/model-artifacts" &&
      toset(azurerm_storage_management_policy.shared_imports[0].rule[0].filters[0].prefix_match) == toset(["csv-imports/"])
    )
    error_message = "Model artifacts must be private, use the existing storage account, and sit outside CSV expiry."
  }

  assert {
    condition = (
      azurerm_role_assignment.model_artifact_publisher[0].scope == azurerm_storage_container.model_artifacts[0].resource_manager_id &&
      azurerm_role_assignment.model_artifact_publisher[0].principal_id == var.model_artifact_publisher_object_id &&
      azurerm_role_assignment.model_artifact_publisher[0].role_definition_name == "Storage Blob Data Contributor"
    )
    error_message = "Publisher access must be scoped to the model artifact container."
  }
}

run "imports_use_shared_storage" {
  command = plan

  override_resource {
    override_during = plan
    target          = azurerm_storage_container.shared_imports[0]
    values = {
      resource_manager_id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate/blobServices/default/containers/csv-imports"
    }
  }

  assert {
    condition = (
      azurerm_storage_container.shared_imports[0].storage_account_id == azurerm_storage_account.state.id &&
      azurerm_storage_queue.shared_imports[0].storage_account_id == azurerm_storage_account.state.id &&
      azurerm_storage_container.shared_imports[0].container_access_type == "private"
    )
    error_message = "State, protected artifacts, CSV imports, and the queue must use one account."
  }

  assert {
    condition = (
      azurerm_role_assignment.shared_import_runtime["blobs"].scope == azurerm_storage_container.shared_imports[0].resource_manager_id &&
      azurerm_role_assignment.shared_import_runtime["queue"].scope == azurerm_storage_queue.shared_imports[0].id &&
      azurerm_role_assignment.shared_import_runtime["sign"].role_definition_name == "Storage Blob Delegator"
    )
    error_message = "The application may delegate upload access and read or write only its import data."
  }
}
