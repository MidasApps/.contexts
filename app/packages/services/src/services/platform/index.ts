// Public surface of the staff console (SP5 Task 10, decisions 0039 and 0041).
export { buildAdminPlatformRoutes, CONSOLE_PERMISSIONS } from "./adapters/driving/admin-platform-route-handler.ts";
export { buildAdminLogsRoutes, LOGS_PERMISSION, type AdminLogsRouteDeps } from "./adapters/driving/admin-logs-route-handler.ts";
export { buildAdminOperationsRoutes, OPERATIONS_PERMISSIONS, type AdminOperationsRouteDeps } from "./adapters/driving/admin-operations-route-handler.ts";
export { requireStaff, requireTenant } from "./adapters/driving/console-guards.ts";
export { createMastraOperationsGateway } from "./adapters/driven/mastra-operations-gateway.ts";
export type { AdminRunsQuery, OperationsError, OperationsGateway, OperationsResult, ScheduleAction } from "./application/ports/operations-gateway.ts";
export { listLogLines, type LogLinesQuery } from "./application/use-cases/list-log-lines.ts";
export {
  AGENT_SETTINGS_COLLECTION,
  createFirestoreAgentSettingsRepository,
  createFirestoreOrganizationAdminStore,
  createFirestorePlanRepository,
  ORGANIZATION_PLANS_COLLECTION,
  PLANS_COLLECTION,
} from "./adapters/driven/firestore-console-stores.ts";
export { createInMemoryConsoleStores } from "./adapters/driven/in-memory-console-stores.ts";
export type { ConsoleDeps } from "./application/console-deps.ts";
export type { AgentSettingsRepository, ConsoleUsage, OrganizationAdminStore, PlanRepository, StoredAgentSettings } from "./application/ports/console-ports.ts";
export { defaultAgentSettingsOf, syncTenantBudget } from "./application/use-cases/sync-tenant-budget.ts";
export { createConsoleServices, createFirebaseConsoleServices, createPostgresConsoleUsage, type ConsoleServices } from "./composition.ts";
