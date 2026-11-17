# Constrain tool/provider versions; the lock file pins exact provider builds.
terraform {
  required_version = "~> 1.14.0"
  # Backend connection settings come from the private backend.hcl file.
  backend "azurerm" {}
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
  }
}

# Use the selected subscription without changing subscription-wide registrations.
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
}

# Expose SQL free-tier properties that AzureRM does not yet support.
provider "azapi" {
  subscription_id = var.subscription_id
}
