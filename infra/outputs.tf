output "resource_group_name" {
  value = local.resource_group_name
}

output "app_url" {
  value = "https://${azurerm_container_app.app.ingress[0].fqdn}"
}

output "api_identity_object_id" {
  value = azurerm_user_assigned_identity.api.principal_id
}

output "sql_server" {
  value = azurerm_mssql_server.sql.fully_qualified_domain_name
}

output "sql_database" {
  value = azapi_resource.database.name
}
