import type { Permission, PlatformRole, Principal } from "@core/contracts";
import type { DenyReason } from "../domain/authorization.ts";
import type { AccessDeps } from "./tenant-access.ts";

export type PlatformAccess =
  | { readonly ok: true; readonly role: PlatformRole; readonly permissions: ReadonlySet<Permission> }
  | { readonly ok: false; readonly reason: DenyReason };

/**
 * Platform permissions (SP1 spec §3.4, §5.2 step 3): only a signed-in user, never
 * through impersonation, with an active profile and an active staff doc. MFA is
 * checked by the callers after the permission, so the UI can ask for it.
 */
export const loadPlatformAccess = async (principal: Principal, deps: AccessDeps): Promise<PlatformAccess> => {
  if (principal.type !== "user" || principal.impersonation !== undefined) return { ok: false, reason: "PERMISSION_NOT_GRANTED" };
  const profile = await deps.readers.principals.getUser(principal.uid);
  if (profile?.status !== "active") return { ok: false, reason: "PRINCIPAL_INACTIVE" };
  const staff = await deps.readers.principals.getPlatformStaff(principal.uid);
  if (staff === null) return { ok: false, reason: "NOT_A_MEMBER" };
  if (!staff.isActive) return { ok: false, reason: "PRINCIPAL_INACTIVE" };
  return { ok: true, role: staff.role, permissions: deps.registry.permissionsForPlatformRole(staff.role) };
};
