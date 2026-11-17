# Separate state keeps cleanup isolated from application resources and migrations.
terraform {
  required_version = "~> 1.14.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
  backend "azurerm" {}
}

provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
}

variable "subscription_id" {
  type = string
}

variable "sql_server_id" {
  type = string
}

variable "runner_ipv4" {
  type = string
  validation {
    condition     = can(cidrnetmask("${var.runner_ipv4}/32")) && var.runner_ipv4 != "0.0.0.0"
    error_message = "Supply the runner's single IPv4 address, never an address range."
  }
}

# The workflow destroys this one-IP rule in its always-run cleanup step.
resource "azurerm_mssql_firewall_rule" "runner" {
  name             = "GitHubActionsDevelopment"
  server_id        = var.sql_server_id
  start_ip_address = var.runner_ipv4
  end_ip_address   = var.runner_ipv4
}
