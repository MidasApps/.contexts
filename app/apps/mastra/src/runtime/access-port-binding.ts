import type { AccessContext, AccessPort, AccessPrincipal, NodeRef } from "@core/agents";
import {
  type NodeRef as CoreNodeRef,
  NodeRefSchema,
  type Permission,
  PermissionSchema,
  type Principal,
  PrincipalSchema,
} from "@core/contracts";
import type { AccessCore, ResolveAccessContext, VerifyBearer } from "@core/services";

// The ports carry the unbranded mirror of SP1's types; SP1 gets its branded values back
// through its own schemas, so a malformed value is a bug that rejects (never allows).
const toPrincipal = (principal: AccessPrincipal): Principal => PrincipalSchema.parse(principal);
/** SP1 principal as the port mirror (an absent impersonation is omitted, not `undefined`). */
const fromPrincipal = (principal: Principal): AccessPrincipal => {
  if (principal.type !== "user") return principal;
  const { impersonation, ...user } = principal;
  return impersonation === undefined ? user : { ...user, impersonation };
};
const toNode = (node: NodeRef): CoreNodeRef => NodeRefSchema.parse(node);
const toPermissions = (permissions: ReadonlySet<string> | undefined): ReadonlySet<Permission> | undefined =>
  permissions === undefined
    ? undefined
    : new Set(
        [...permissions].flatMap((permission) => {
          const parsed = PermissionSchema.safeParse(permission);
          return parsed.success ? [parsed.data] : [];
        }),
      );

const ceilingOf = (ceiling: ReadonlySet<string> | undefined) => {
  const permissions = toPermissions(ceiling);
  return permissions === undefined ? {} : { ceiling: permissions };
};

/**
 * SP1 `resolveAccessContext` (SP1 spec §10, commit 593ec6b) as the port: effective
 * permissions (sorted) and regional settings of the principal at the node, or `null`
 * (not a member, gone, platform node, no `core.organization.read`): fail-closed.
 */
const bindResolveAccessContext =
  (resolve: ResolveAccessContext): AccessPort["resolveAccessContext"] =>
  async ({ principal, node }) => {
    const resolved = await resolve({ principal: toPrincipal(principal), node: toNode(node) });
    if (resolved === null) return null;
    const context: AccessContext = {
      tenantId: resolved.tenantId,
      ...(resolved.projectId === undefined ? {} : { projectId: resolved.projectId }),
      ...(resolved.unitId === undefined ? {} : { unitId: resolved.unitId }),
      principal: fromPrincipal(resolved.principal),
      permissions: [...resolved.permissions],
      regional: resolved.regional,
    };
    return context;
  };

/**
 * Binds `AccessPort` to SP1 (decision 0019): `verifyBearer` of `createCoreServer`,
 * `authorize` / `getEffectivePermissions` of the access core (a fresh request scope
 * per call) and SP1's `resolveAccessContext`. Every path fails closed: SP1
 * rejections propagate, denials stay denials.
 */
export const bindAccessPort = (deps: {
  verifyBearer: VerifyBearer;
  access: AccessCore;
  resolveAccessContext: ResolveAccessContext;
}): AccessPort => ({
  verifyBearer: async (input) => {
    const principal = await deps.verifyBearer(input);
    return principal === null ? null : fromPrincipal(principal);
  },
  resolveAccessContext: bindResolveAccessContext(deps.resolveAccessContext),
  authorize: async ({ principal, permission, node, ceiling }) => {
    const parsed = PermissionSchema.safeParse(permission);
    if (!parsed.success) return { allowed: false, reason: "UNKNOWN_PERMISSION" };
    const decision = await deps.access.forRequest().authorize({
      principal: toPrincipal(principal),
      permission: parsed.data,
      node: toNode(node),
      ...ceilingOf(ceiling),
    });
    return decision.allowed
      ? { allowed: true, requiresApproval: decision.requiresApproval }
      : { allowed: false, reason: decision.reason };
  },
  getEffectivePermissions: async ({ principal, node, ceiling }) => {
    const result = await deps.access
      .forRequest()
      .getEffectivePermissions({ principal: toPrincipal(principal), node: toNode(node), ...ceilingOf(ceiling) });
    return result.ok ? result.permissions : new Set<string>();
  },
});
