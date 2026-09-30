// Public API of the access context (SP1 Task 6): the only place that decides permissions.
export { createAccessCore, type AccessCore, type RequestAccess } from "./composition.ts";
export type { AuthorizeDecision, DenyReason, GrantSource } from "./domain/authorization.ts";
export type { CustomRoleRecord, GrantRecord } from "./domain/grant.ts";
export { chainNodeIds, checkNodeChain, isNodeWithin, type ChainNode, type ChainUnit, type NodeChain } from "./domain/node-chain.ts";
export {
  CORE_PERMISSION_SOURCE,
  createPermissionRegistry,
  PermissionRegistryError,
  type PermissionRegistry,
  type PermissionRegistryErrorCode,
  type PermissionSource,
} from "./domain/permission-registry.ts";
export { computeEffectivePermissions, type EffectivePermissions } from "./domain/effective-permissions.ts";
export { assertNoEscalation, type EscalationCheck } from "./domain/escalation-guard.ts";
export type { AccessReaders } from "./application/ports/driven/access-readers.ts";
export type { GrantReader } from "./application/ports/driven/grant-reader.ts";
export type { RoleReader } from "./application/ports/driven/role-reader.ts";
export type { NodeChainReader } from "./application/ports/driven/node-chain-reader.ts";
export type {
  ApiKeyStatusRecord,
  DeviceStatusRecord,
  ImpersonationSessionRecord,
  PlatformStaffRecord,
  PrincipalStatusReader,
  UserStatusRecord,
} from "./application/ports/driven/principal-status-reader.ts";
export type {
  Authorize,
  AuthorizeRequest,
  EffectivePermissionsRequest,
  EffectivePermissionsResult,
  GetEffectivePermissions,
} from "./application/ports/driving/authorize.ts";
export { createRequestScope } from "./application/request-scope.ts";
export { makeAuthorize } from "./application/use-cases/authorize.ts";
export { makeGetEffectivePermissions } from "./application/use-cases/get-effective-permissions.ts";
export type { AccessDeps } from "./application/tenant-access.ts";
export {
  createInMemoryAccessStore,
  type AccessReaderCall,
  type InMemoryAccessStore,
} from "./adapters/driven/in-memory-access-store.ts";
