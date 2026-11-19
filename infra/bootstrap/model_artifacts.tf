variable "model_artifact_publisher_object_id" {
  type        = string
  default     = null
  description = "Entra object ID of the user or service principal that publishes model artifacts."
}

resource "azurerm_storage_container" "model_artifacts" {
  count                 = local.configure_ci
  name                  = "model-artifacts"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
}

resource "azurerm_role_assignment" "model_artifact_publisher" {
  count                = var.model_artifact_publisher_object_id == null ? 0 : local.configure_ci
  scope                = azurerm_storage_container.model_artifacts[0].resource_manager_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.model_artifact_publisher_object_id
}

output "model_artifact_container_url" {
  description = "Container URL for the training CLI's --artifact-container-url option."
  value = local.configure_ci == 0 ? null : format(
    "%s/%s",
    trimsuffix(azurerm_storage_account.state.primary_blob_endpoint, "/"),
    azurerm_storage_container.model_artifacts[0].name,
  )
}
