// Public API of the connector entity (SP5 Task 13): connectors as platform staff read them.
export {
  ADMIN_CONNECTORS_PAGE_LIMIT,
  adminConnectorsQuery,
  connectorKeys,
  useAdminConnectors,
} from "./api/connector-queries.ts";
// SP5 Task 14: the organization's own connectors (`/settings/connectors`).
export {
  TENANT_CONNECTORS_PAGE_LIMIT,
  tenantConnectorKeys,
  tenantConnectorsQuery,
  useTenantConnectors,
} from "./api/tenant-connector-queries.ts";
