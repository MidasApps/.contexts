// Public surface of the staff console (SP5 Task 10, decisions 0039 and 0041).
export { buildAdminPlatformRoutes, CONSOLE_PERMISSIONS } from "./adapters/driving/admin-platform-route-handler.ts";
export { requireStaff, requireTenant } from "./adapters/driving/console-guards.ts";
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
