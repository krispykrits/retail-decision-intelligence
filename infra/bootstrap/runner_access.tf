# Permit deployment to manage temporary IP rules on this SQL server only.
resource "azurerm_role_definition" "runner_access" {
  count       = local.configure_ci
  name        = "${var.name_prefix}-sql-firewall"
  scope       = azurerm_resource_group.project.id
  description = "Manage deployment IP firewall rules; no SQL data or server administration."
  permissions {
    actions = [
      "Microsoft.Sql/servers/firewallRules/read",
      "Microsoft.Sql/servers/firewallRules/write",
      "Microsoft.Sql/servers/firewallRules/delete",
    ]
  }
}

resource "azurerm_role_assignment" "runner_access" {
  count              = local.configure_ci
  scope              = "${azurerm_resource_group.project.id}/providers/Microsoft.Sql/servers/${var.name_prefix}-sql-${var.sql_location}"
  role_definition_id = azurerm_role_definition.runner_access[0].role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.deployment[0].principal_id
}
