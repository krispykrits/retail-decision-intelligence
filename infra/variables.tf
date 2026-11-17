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

variable "app_image" {
  description = "Publicly pullable combined frontend/API image pinned to its sha256 digest."
  type        = string
  validation {
    condition     = can(regex("^.+@sha256:[a-f0-9]{64}$", var.app_image))
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

variable "sql_location" {
  description = "SQL region override when the subscription restricts the app region."
  type        = string
  default     = null
}

variable "sql_allowed_ipv4_addresses" {
  description = "Reviewed individual operator/client IPv4 addresses."
  type        = set(string)
  default     = []
  validation {
    condition = alltrue([
      for ip in var.sql_allowed_ipv4_addresses :
      can(cidrnetmask("${ip}/32")) && ip != "0.0.0.0"
    ])
    error_message = "Supply individual IPv4 addresses; use sql_allow_azure_services for Azure-wide access."
  }
}

variable "sql_allow_azure_services" {
  description = "Development opt-in: allow Azure network sources and provision API database ownership using the operator's Azure CLI identity."
  type        = bool
  default     = false
}

variable "account_mail" {
  description = "STARTTLS SMTP delivery settings supplied through the development ACCOUNT_MAIL secret."
  type = object({
    host     = string
    port     = optional(number, 587)
    username = string
    password = string
    sender   = string
  })
  sensitive = true
  default   = null
}
