mock_provider "azurerm" {
  mock_resource "azurerm_storage_account" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-rdi-test/providers/Microsoft.Storage/storageAccounts/rditeststate" }
  }
}

variables {
  subscription_id          = "11111111-1111-1111-1111-111111111111"
  resource_group_name      = "rg-rdi-test"
  location                 = "eastus"
  state_storage_name       = "rditeststate"
  state_operator_object_id = "22222222-2222-2222-2222-222222222222"
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
}
