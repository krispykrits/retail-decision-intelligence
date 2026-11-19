variable "retain_legacy_import_storage" {
  type        = bool
  default     = true
  description = "Keep the previous CSV storage during cutover. Set false after draining and verifying the import path."
}

locals {
  retain_legacy_import_storage = var.retain_legacy_import_storage ? local.configure_ci : 0
}

# Preserve existing resources and their state addresses until the cutover is verified.
resource "azurerm_storage_account" "imports" {
  count                           = local.retain_legacy_import_storage
  name                            = "${replace(var.name_prefix, "-", "")}imports"
  resource_group_name             = azurerm_resource_group.project.name
  location                        = azurerm_resource_group.project.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  allow_nested_items_to_be_public = false
  tags                            = azurerm_resource_group.project.tags

  blob_properties {
    cors_rule {
      allowed_origins    = ["https://${data.azurerm_container_app.development[0].ingress[0].fqdn}"]
      allowed_methods    = ["PUT"]
      allowed_headers    = ["content-type", "if-none-match", "x-ms-blob-type", "x-ms-version"]
      exposed_headers    = ["etag"]
      max_age_in_seconds = 600
    }
  }
}

resource "azurerm_storage_container" "imports" {
  count                 = local.retain_legacy_import_storage
  name                  = "csv-imports"
  storage_account_id    = azurerm_storage_account.imports[0].id
  container_access_type = "private"
}

resource "azurerm_storage_queue" "imports" {
  count              = local.retain_legacy_import_storage
  name               = "csv-imports"
  storage_account_id = azurerm_storage_account.imports[0].id
}

resource "azurerm_storage_management_policy" "imports" {
  count              = local.retain_legacy_import_storage
  storage_account_id = azurerm_storage_account.imports[0].id

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
    }
  }
}

resource "azurerm_role_assignment" "import_runtime" {
  for_each = local.retain_legacy_import_storage == 0 ? {} : {
    sign = {
      scope = azurerm_storage_account.imports[0].id
      role  = "Storage Blob Delegator"
    }
    blobs = {
      scope = azurerm_storage_container.imports[0].resource_manager_id
      role  = "Storage Blob Data Contributor"
    }
    queue = {
      scope = azurerm_storage_queue.imports[0].id
      role  = "Storage Queue Data Contributor"
    }
  }
  scope                = each.value.scope
  role_definition_name = each.value.role
  principal_id         = data.azurerm_user_assigned_identity.api[0].principal_id
}
