// Composition root of the access context: builds the permission registry once and a
// fresh request scope per request (reads memoized per request, never across).
import { systemClock, type Clock } from "../shared/clock/clock.ts";
import { CORE_PERMISSION_SOURCE, createPermissionRegistry, type PermissionRegistry, type PermissionSource } from "./domain/permission-registry.ts";
import type { AccessReaders } from "./application/ports/driven/access-readers.ts";
import type { Authorize, GetEffectivePermissions } from "./application/ports/driving/authorize.ts";
import { createRequestScope } from "./application/request-scope.ts";
import { makeAuthorize } from "./application/use-cases/authorize.ts";
import { makeGetEffectivePermissions } from "./application/use-cases/get-effective-permissions.ts";
import type { Transaction } from "firebase-admin/firestore";
import type { AccessWriteDeps } from "./application/access-write-deps.ts";
import { prepareGrant, type PrepareGrantArgs } from "./application/membership-writes.ts";
import type { AccessProjectionStore } from "./application/ports/driven/access-projection-writer.ts";
import { makeCreateRole, type CreateRole } from "./application/use-cases/create-role.ts";
import { makeDeleteRole, type DeleteRole } from "./application/use-cases/delete-role.ts";
import { makeGetRole, type GetRole } from "./application/use-cases/get-role.ts";
import { makeGrantMembership, type GrantMembership } from "./application/use-cases/grant-membership.ts";
import { makeListRoles, type ListRoles } from "./application/use-cases/list-roles.ts";
import { makeRevokeMembership, type RevokeMembership } from "./application/use-cases/revoke-membership.ts";
import type { SyncClaims } from "./application/use-cases/sync-claims.ts";
import { makeUpdateMembership, type UpdateMembership } from "./application/use-cases/update-membership.ts";
import { makeUpdateRole, type UpdateRole } from "./application/use-cases/update-role.ts";

/** Access use cases bound to one request's memoized reads. */
export type RequestAccess = { readonly authorize: Authorize; readonly getEffectivePermissions: GetEffectivePermissions };

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
  projections: deps.projections,
  registry: deps.registry,
});
