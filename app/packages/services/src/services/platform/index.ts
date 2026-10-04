// Public surface of the staff console (SP5 Task 10, decisions 0039 and 0041).

export { createFirestoreAdminUserDirectory } from "./adapters/driven/firestore-admin-user-directory.ts";
export {
  AGENT_SETTINGS_COLLECTION,
  createFirestoreAgentSettingsRepository,
  createFirestoreOrganizationAdminStore,
  createFirestorePlanRepository,
  ORGANIZATION_PLANS_COLLECTION,
  PLANS_COLLECTION,
} from "./adapters/driven/firestore-console-stores.ts";
export {
  type AdminUserSeed,
  createInMemoryAdminUserDirectory,
  type InMemoryAdminUserDirectory,
} from "./adapters/driven/in-memory-admin-user-directory.ts";
export { createInMemoryConsoleStores } from "./adapters/driven/in-memory-console-stores.ts";
export { createMastraOperationsGateway } from "./adapters/driven/mastra-operations-gateway.ts";
export {
  type AdminLogsRouteDeps,
  buildAdminLogsRoutes,
  LOGS_PERMISSION,
} from "./adapters/driving/admin-logs-route-handler.ts";
export {
  type AdminOperationsRouteDeps,
  buildAdminOperationsRoutes,
  OPERATIONS_PERMISSIONS,
} from "./adapters/driving/admin-operations-route-handler.ts";
export { buildAdminPlatformRoutes, CONSOLE_PERMISSIONS } from "./adapters/driving/admin-platform-route-handler.ts";
export {
  type AdminUsersRouteDeps,
  buildAdminUsersRoutes,
  USERS_PERMISSION,
} from "./adapters/driving/admin-users-route-handler.ts";
export { requireStaff, requireTenant } from "./adapters/driving/console-guards.ts";
export type { ConsoleDeps } from "./application/console-deps.ts";
export type { AdminUserDirectory } from "./application/ports/admin-user-directory.ts";
export type {
  AgentSettingsRepository,
  ConsoleUsage,
  OrganizationAdminStore,
  PlanRepository,
  StoredAgentSettings,
} from "./application/ports/console-ports.ts";
export type {
  AdminRunsQuery,
  OperationsError,
  OperationsGateway,
  OperationsResult,
  ScheduleAction,
} from "./application/ports/operations-gateway.ts";
export { type LogLinesQuery, listLogLines } from "./application/use-cases/list-log-lines.ts";
export { defaultAgentSettingsOf, syncTenantBudget } from "./application/use-cases/sync-tenant-budget.ts";
export {
  type ConsoleServices,
  createConsoleServices,
  createFirebaseConsoleServices,
  createPostgresConsoleUsage,
} from "./composition.ts";
