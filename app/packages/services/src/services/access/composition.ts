// Composition root of the access context: builds the permission registry once and a
// fresh request scope per request (reads memoized per request, never across).
import { systemClock, type Clock } from "../shared/clock/clock.ts";
import { CORE_PERMISSION_SOURCE, createPermissionRegistry, type PermissionRegistry, type PermissionSource } from "./domain/permission-registry.ts";
import type { AccessReaders } from "./application/ports/driven/access-readers.ts";
import type { Authorize, GetEffectivePermissions } from "./application/ports/driving/authorize.ts";
import { createRequestScope } from "./application/request-scope.ts";
import { makeAuthorize } from "./application/use-cases/authorize.ts";
import { makeGetEffectivePermissions } from "./application/use-cases/get-effective-permissions.ts";

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
