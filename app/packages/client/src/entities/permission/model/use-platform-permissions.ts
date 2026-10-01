"use client";

import { CORE_PERMISSIONS, type Permission, type PlatformRole } from "@core/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { meQuery } from "#/shared/api/core-queries.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import type { PermissionsState } from "./use-can.ts";

const PLATFORM_ROLES_BY_PERMISSION: ReadonlyMap<string, readonly string[]> = new Map(
  CORE_PERMISSIONS.filter((definition) => definition.scope === "platform").map((definition) => [definition.id, definition.defaultRoles]),
);

/**
 * Whether a staff role holds a `platform.*` permission (SP1 core permissions: platform permissions
 * are granted by role, never at a node). Tenant permissions and a missing role are always `false`.
 */
export const platformRoleCan = (role: PlatformRole | undefined, permission: Permission): boolean =>
  role !== undefined && (PLATFORM_ROLES_BY_PERMISSION.get(permission)?.includes(role) ?? false);

const denyAll = (): boolean => false;

/**
 * Platform permissions of the signed-in staff member (the `/admin` navigation), from the role in
 * `GET /v1/me`. It only hides what the role cannot open: the server guards `/admin` (staff + MFA)
 * and every admin endpoint authorizes on its own.
 */
export const usePlatformPermissions = (): PermissionsState => {
  const callEndpoint = useCallEndpoint();
  const query = useQuery({ ...meQuery(callEndpoint), enabled: useIsSignedIn() });
  const role = query.data?.platformRole;
  const can = useCallback((permission: Permission) => platformRoleCan(role, permission), [role]);
  const { refetch } = query;
  return { status: query.status, can: query.data === undefined ? denyAll : can, error: query.error, refetch: () => void refetch() };
};
