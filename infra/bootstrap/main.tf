terraform {
  required_version = "~> 1.14.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {
    storage {
      data_plane_available = false
    }
  }
  subscription_id                 = var.subscription_id
  storage_use_azuread             = true
  resource_provider_registrations = "none"
}

variable "subscription_id" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "state_storage_name" {
  type = string
}

variable "state_operator_object_id" {
  description = "Entra object ID of the developer or deployment principal managing state."
  type        = string
}

resource "azurerm_resource_group" "project" {
  name     = var.resource_group_name
  location = var.location
  tags     = { project = "retail-decision-intelligence", environment = "dev" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_account" "state" {
  name                            = var.state_storage_name
  resource_group_name             = azurerm_resource_group.project.name
  location                        = azurerm_resource_group.project.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  tags                            = azurerm_resource_group.project.tags

  blob_properties {
    versioning_enabled = true
    delete_retention_policy { days = 7 }
    container_delete_retention_policy { days = 7 }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "state_operator" {
  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.state_operator_object_id
}

resource "azurerm_storage_container" "state" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
  depends_on            = [azurerm_role_assignment.state_operator]
}

output "backend_config" {
  value = {
    resource_group_name  = azurerm_resource_group.project.name
    storage_account_name = azurerm_storage_account.state.name
    container_name       = azurerm_storage_container.state.name
    use_azuread_auth     = true
  }
}
