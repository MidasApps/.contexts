// Public API of the tenancy context (SP1 Task 10): organizations, projects, unit tree, regional settings.

export {
  createFirestoreTenancyAdapters,
  type FirestoreTenancyAdapters,
} from "./adapters/driven/firestore-tenancy-adapters.ts";
export { createInMemoryTenancyStore, type InMemoryTenancyStore } from "./adapters/driven/in-memory-tenancy-store.ts";
export { tenancyErrorResponse } from "./adapters/driving/tenancy-error-response.ts";
export type { OrganizationRepository } from "./application/ports/driven/organization-repository.ts";
export type { ProjectRepository } from "./application/ports/driven/project-repository.ts";
export type { UnitRepository } from "./application/ports/driven/unit-repository.ts";
export type { TenancyCommand, TenancyDeps } from "./application/tenancy-deps.ts";
export { UserAccountMissingError } from "./application/use-cases/create-organization.ts";
export {
  type LoadNode,
  type NodeDetails,
  type ResolveNodeRegionalSettings,
  regionalSettingsAt,
} from "./application/use-cases/resolve-regional-settings.ts";
export { createTenancyServices, type TenancyServices } from "./composition.ts";
export { CORE_UNIT_TYPE_ID, CORE_UNIT_TYPES } from "./domain/core-unit-types.ts";
export { InvalidUnitParentError, type InvalidUnitParentReason } from "./domain/errors/invalid-unit-parent-error.ts";
export { SubtreeTooLargeError } from "./domain/errors/subtree-too-large-error.ts";
export { TenancyNotFoundError } from "./domain/errors/tenancy-not-found-error.ts";
export { resolveRegionalSettings } from "./domain/regional-settings.ts";
export {
  MAX_SUBTREE_REWRITE,
  type MovePlan,
  placementUnder,
  planMove,
  type TreeRewrite,
  type TreeUnit,
} from "./domain/unit-tree.ts";
export {
  createUnitTypeRegistry,
  type UnitTypeRegistry,
  UnitTypeRegistryError,
  type UnitTypeRegistryErrorCode,
} from "./domain/unit-type-registry.ts";
