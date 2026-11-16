variable "subscription_id" {
  type = string
}

variable "resource_group_name" {
  description = "The single project resource group created by infra/bootstrap."
  type        = string
}

variable "name_prefix" {
  description = "Globally unique lowercase prefix for service names."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.name_prefix))
    error_message = "Use 3–20 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "static_web_app_location" {
  description = "Supported Static Web Apps region; resources still use the same resource group."
  type        = string
}

variable "api_image" {
  description = "Publicly pullable project API image pinned to its sha256 digest."
  type        = string
  validation {
    condition     = can(regex("^.+@sha256:[a-f0-9]{64}$", var.api_image))
    error_message = "Supply an immutable project image reference ending in @sha256:<64 hex digits>."
  }
}

variable "sql_admin_object_id" {
  description = "Entra object ID of the developer/admin group, not the API identity."
  type        = string
}

variable "sql_admin_login" {
  type = string
}

variable "sql_allowed_ipv4_addresses" {
  description = "Reviewed API outbound IPs. Empty initially keeps SQL inaccessible over the network."
  type        = set(string)
  default     = []
  validation {
    condition = alltrue([
      for ip in var.sql_allowed_ipv4_addresses :
      can(cidrnetmask("${ip}/32")) && ip != "0.0.0.0"
    ])
    error_message = "Supply individual IPv4 addresses; 0.0.0.0 (Allow Azure services) is forbidden."
  }
}
