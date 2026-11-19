resource "azurerm_storage_container" "shared_imports" {
  count                 = local.configure_ci
  name                  = "csv-imports"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
}

resource "azurerm_storage_queue" "shared_imports" {
  count              = local.configure_ci
  name               = "csv-imports"
  storage_account_id = azurerm_storage_account.state.id
}

resource "azurerm_storage_management_policy" "shared_imports" {
  count              = local.configure_ci
  storage_account_id = azurerm_storage_account.state.id

  rule {
    name    = "expire-uploaded-csv"
    enabled = true
    filters {
      prefix_match = ["csv-imports/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = 3
      }
      version {
        delete_after_days_since_creation = 3
      }
      snapshot {
        delete_after_days_since_creation_greater_than = 3
      }
    }
  }
}

resource "azurerm_role_assignment" "shared_import_runtime" {
  for_each = local.configure_ci == 0 ? {} : {
    sign = {
      scope = azurerm_storage_account.state.id
      role  = "Storage Blob Delegator"
    }
    blobs = {
      scope = azurerm_storage_container.shared_imports[0].resource_manager_id
      role  = "Storage Blob Data Contributor"
    }
    queue = {
      scope = azurerm_storage_queue.shared_imports[0].id
      role  = "Storage Queue Data Contributor"
    }
  }
  scope                = each.value.scope
  role_definition_name = each.value.role
  principal_id         = data.azurerm_user_assigned_identity.api[0].principal_id
}
