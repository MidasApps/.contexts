import type { Permission } from "@core/contracts";
import { loadPlatformAccess } from "../platform-access.ts";
import type { EffectivePermissionsRequest, EffectivePermissionsResult, GetEffectivePermissions } from "../ports/driving/authorize.ts";
import { limitToSubject, loadTenantAccess, type AccessDeps } from "../tenant-access.ts";

const withinCeiling = (permissions: ReadonlySet<Permission>, ceiling: ReadonlySet<Permission> | undefined): ReadonlySet<Permission> =>
  ceiling === undefined ? permissions : new Set([...permissions].filter((permission) => ceiling.has(permission)));

const platformPermissions = async (request: EffectivePermissionsRequest, deps: AccessDeps): Promise<EffectivePermissionsResult> => {
  const access = await loadPlatformAccess(request.principal, deps);
  if (!access.ok) return access;
  if (request.principal.type !== "user" || !request.principal.mfa) return { ok: false, reason: "MFA_REQUIRED" };
  return { ok: true, permissions: withinCeiling(access.permissions, request.ceiling) };
};

/**
 * Creates the read model of `authorize()` (SP1 spec §5.2): every permission the
 * principal holds at a node, after the same checks (node chain, principal status,
 * key scopes, impersonation read-only, ceiling). `authorize()` stays the decision
 * point; this feeds UI menus and SP3's agent context.
 */
export const makeGetEffectivePermissions =
  (deps: AccessDeps): GetEffectivePermissions =>
  async (request) => {
    const { node } = request;
    if (node.level === "platform") return platformPermissions(request, deps);
    const access = await loadTenantAccess({ principal: request.principal, node, deps });
    if (!access.ok) return access;
    const limited = limitToSubject({ permissions: access.effective.permissions, subject: access.subject, registry: deps.registry });
    return { ok: true, permissions: withinCeiling(limited, request.ceiling) };
  };
