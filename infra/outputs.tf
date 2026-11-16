output "resource_group_name" {
  value = local.resource_group_name
}

output "web_url" {
  value = "https://${azurerm_static_web_app.web.default_host_name}"
}

output "api_url" {
  value = "https://${azurerm_container_app.api.ingress[0].fqdn}"
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

output "api_outbound_ipv4_addresses" {
  value = azurerm_container_app.api.outbound_ip_addresses
}
