// Composition root of the access context: builds the permission registry once and a
// fresh request scope per request (reads memoized per request, never across).

import type { MyGrant, Permission, Principal, RoleRef, TenantId, TenantNodeRef, UserPrincipal } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { type Clock, systemClock } from "../shared/clock/clock.ts";
import type { Result } from "../shared/result/result.ts";
import type { AccessWriteDeps } from "./application/access-write-deps.ts";
import { checkGrantable, type GrantCheckError } from "./application/grant-checks.ts";
import { type PrepareGrantArgs, prepareGrant, prepareRevokeAllGrants } from "./application/membership-writes.ts";
import { listLiveGrantNodes, requireOrganizationMember } from "./application/organization-membership.ts";
import type { AccessProjectionStore } from "./application/ports/driven/access-projection-writer.ts";
import type { AccessReaders } from "./application/ports/driven/access-readers.ts";
import type { Authorize, GetEffectivePermissions } from "./application/ports/driving/authorize.ts";
import { createRequestScope } from "./application/request-scope.ts";
import { makeAuthorize } from "./application/use-cases/authorize.ts";
import { type CreateRole, makeCreateRole } from "./application/use-cases/create-role.ts";
import { type DeleteRole, makeDeleteRole } from "./application/use-cases/delete-role.ts";
import { makeGetEffectivePermissions } from "./application/use-cases/get-effective-permissions.ts";
import { type GetRole, makeGetRole } from "./application/use-cases/get-role.ts";
import { type GrantMembership, makeGrantMembership } from "./application/use-cases/grant-membership.ts";
import { type ListRoles, makeListRoles } from "./application/use-cases/list-roles.ts";
import { makeRevokeMembership, type RevokeMembership } from "./application/use-cases/revoke-membership.ts";
import type { SyncClaims } from "./application/use-cases/sync-claims.ts";
import { makeUpdateMembership, type UpdateMembership } from "./application/use-cases/update-membership.ts";
import { makeUpdateRole, type UpdateRole } from "./application/use-cases/update-role.ts";
import type { ProjectionPrincipal } from "./domain/access-projection.ts";
import type { AccessDeniedError } from "./domain/errors/access-denied-error.ts";
import {
  CORE_PERMISSION_SOURCE,
  createPermissionRegistry,
  type PermissionRegistry,
  type PermissionSource,
} from "./domain/permission-registry.ts";

/** Access use cases bound to one request's memoized reads. */
export type RequestAccess = {
  readonly authorize: Authorize;
  readonly getEffectivePermissions: GetEffectivePermissions;
};

export type AccessCore = {
  readonly registry: PermissionRegistry;
  /** Call once per request (the `/v1` pipeline does); drop the result when the request ends. */
  readonly forRequest: () => RequestAccess;
};

/**
 * Wires `authorize()` and `getEffectivePermissions()` (SP1 Task 6). Firestore readers
 * arrive in Task 9; tests pass `createInMemoryAccessStore()`.
 * @param permissions module permission sources; the core catalog is always included.
 * @throws {PermissionRegistryError} when the permission sources conflict (startup bug).
 * @example
 *   const access = createAccessCore({ permissions: [{ moduleId: "sample", permissions: SAMPLE_PERMISSIONS }], readers });
 *   const { authorize } = access.forRequest();
 */
export const createAccessCore = (args: {
  permissions?: readonly PermissionSource[];
  readers: AccessReaders;
  clock?: Clock;
}): AccessCore => {
  const registry = createPermissionRegistry([CORE_PERMISSION_SOURCE, ...(args.permissions ?? [])]);
  const clock = args.clock ?? systemClock;
  return {
    registry,
    forRequest: () => {
      const deps = { registry, readers: createRequestScope(args.readers), clock };
      return { authorize: makeAuthorize(deps), getEffectivePermissions: makeGetEffectivePermissions(deps) };
    },
  };
};

/** Access write side (SP1 Task 9): grants, roles and the claims projection. */
export type AccessServices = {
  readonly grantMembership: GrantMembership;
  readonly updateMembership: UpdateMembership;
  readonly revokeMembership: RevokeMembership;
  readonly createRole: CreateRole;
  readonly getRole: GetRole;
  readonly listRoles: ListRoles;
  readonly updateRole: UpdateRole;
  readonly deleteRole: DeleteRole;
  readonly syncClaims: SyncClaims;
  /** Grant inside another context's transaction (`createOrganization`'s owner grant). */
  readonly prepareGrant: (tx: Transaction, args: PrepareGrantArgs) => ReturnType<typeof prepareGrant>;
  /** Revoke every grant of a principal inside another context's transaction (device revocation). */
  readonly prepareRevokeAllGrants: (
    tx: Transaction,
    args: { tenantId: TenantId; principal: ProjectionPrincipal; actorId: string },
  ) => ReturnType<typeof prepareRevokeAllGrants>;
  /** Grant checks for other contexts (device activations): permission at the node, live roles, no escalation. */
  readonly checkGrantable: (args: {
    access: RequestAccess;
    actor: Principal;
    permission: Permission;
    node: TenantNodeRef;
    roles: readonly RoleRef[];
  }) => Promise<Result<void, GrantCheckError>>;
  /** Live member anywhere in the organization's tree, from the grants (`PUT /v1/me/active-organization`, decision 0030 A5). */
  readonly requireOrganizationMember: (args: {
    access: RequestAccess;
    actor: UserPrincipal;
    tenantId: TenantId;
  }) => Promise<Result<void, AccessDeniedError>>;
  /** The caller's live grant nodes in an organization, widest first (`GET /v1/me/grants`, decision 0030 A7). */
  readonly listLiveGrantNodes: (args: {
    access: RequestAccess;
    actor: UserPrincipal;
    tenantId: TenantId;
  }) => Promise<Result<MyGrant[], AccessDeniedError>>;
  /** The projection read model (tenancy lists visible projects and revokes on organization delete). */
  readonly projections: AccessProjectionStore;
  readonly registry: PermissionRegistry;
};

/**
 * Binds the access write use cases to their adapters (Firestore in `createCoreServer`,
 * in-memory fakes in unit tests).
 */
export const createAccessServices = (deps: AccessWriteDeps): AccessServices => ({
  grantMembership: makeGrantMembership(deps),
  updateMembership: makeUpdateMembership(deps),
  revokeMembership: makeRevokeMembership(deps),
  createRole: makeCreateRole(deps),
  getRole: makeGetRole(deps),
  listRoles: makeListRoles(deps),
  updateRole: makeUpdateRole(deps),
  deleteRole: makeDeleteRole(deps),
  syncClaims: deps.syncClaims,
  prepareGrant: (tx, args) => prepareGrant(tx, deps, args),
  prepareRevokeAllGrants: (tx, args) => prepareRevokeAllGrants(tx, deps, args),
  checkGrantable: (args) => checkGrantable(deps, args),
  requireOrganizationMember: (args) => requireOrganizationMember(deps, args),
  listLiveGrantNodes: (args) => listLiveGrantNodes(deps, args),
  projections: deps.projections,
  registry: deps.registry,
});
