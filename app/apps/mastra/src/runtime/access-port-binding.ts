import type { AccessContext, AccessPort, AccessPrincipal, NodeRef, RegionalSettings } from "@core/agents";
import { type NodeRef as CoreNodeRef, NodeRefSchema, type Permission, PermissionSchema, type Principal, PrincipalSchema } from "@core/contracts";
import type { AccessCore, VerifyBearer } from "@core/services";

/**
 * Regional settings of a principal at a node (SP1 spec §4). SP1 exposes them
 * with `resolveAccessContext` in its Task 12; until then this narrow port is
 * bound fail-closed (see `UNWIRED_REGIONAL_SETTINGS`).
 * @returns `null` when the node has no settings for the principal (no context, 403).
 */
export type RegionalSettingsResolver = (input: { principal: AccessPrincipal; node: NodeRef }) => Promise<RegionalSettings | null>;

/** Bug guard: SP1's regional resolution is not wired yet; authentication rejects (never guesses a locale or currency). */
export class RegionalSettingsNotWiredError extends Error {
  readonly code = "REGIONAL_SETTINGS_NOT_WIRED";

  constructor() {
    super("REGIONAL_SETTINGS_NOT_WIRED: bind SP1 resolveAccessContext (SP1 Task 12) in create-runtime-ports.ts");
    this.name = "RegionalSettingsNotWiredError";
  }
}

/** Interim binding until SP1 Task 12: every access context resolution rejects. */
export const UNWIRED_REGIONAL_SETTINGS: RegionalSettingsResolver = () => Promise.reject(new RegionalSettingsNotWiredError());

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
  permissions === undefined ? undefined : new Set([...permissions].flatMap((permission) => {
    const parsed = PermissionSchema.safeParse(permission);
    return parsed.success ? [parsed.data] : [];
  }));

const ceilingOf = (ceiling: ReadonlySet<string> | undefined) => {
  const permissions = toPermissions(ceiling);
  return permissions === undefined ? {} : { ceiling: permissions };
};

/**
 * `resolveAccessContext` from SP1's read model (`getEffectivePermissions`) plus
 * regional settings; one request scope for both reads. No permissions at the
 * node (not a member, suspended, outside key scope...) → `null`.
 */
const makeResolveAccessContext =
  (access: AccessCore, regional: RegionalSettingsResolver): AccessPort["resolveAccessContext"] =>
  async ({ principal, node }) => {
    if (node.level === "platform") return null;
    const result = await access.forRequest().getEffectivePermissions({ principal: toPrincipal(principal), node: toNode(node) });
    if (!result.ok || result.permissions.size === 0) return null;
    const settings = await regional({ principal, node });
    if (settings === null) return null;
    const context: AccessContext = {
      tenantId: node.tenantId,
      ...(node.level === "organization" ? {} : { projectId: node.projectId }),
      ...(node.level === "unit" ? { unitId: node.unitId } : {}),
      principal,
      permissions: [...result.permissions].sort(),
      regional: settings,
    };
    return context;
  };

/**
 * Binds `AccessPort` to SP1 (decision 0019): `verifyBearer` of `createCoreServer`,
 * `authorize` / `getEffectivePermissions` of the access core (a fresh request
 * scope per call), and an interim `resolveAccessContext` until SP1 Task 12.
 * Every path fails closed: SP1 rejections propagate, denials stay denials.
 */
export const bindAccessPort = (deps: { verifyBearer: VerifyBearer; access: AccessCore; regional: RegionalSettingsResolver }): AccessPort => ({
  verifyBearer: async (input) => {
    const principal = await deps.verifyBearer(input);
    return principal === null ? null : fromPrincipal(principal);
  },
  resolveAccessContext: makeResolveAccessContext(deps.access, deps.regional),
  authorize: async ({ principal, permission, node, ceiling }) => {
    const parsed = PermissionSchema.safeParse(permission);
    if (!parsed.success) return { allowed: false, reason: "UNKNOWN_PERMISSION" };
    const decision = await deps.access.forRequest().authorize({ principal: toPrincipal(principal), permission: parsed.data, node: toNode(node), ...ceilingOf(ceiling) });
    return decision.allowed ? { allowed: true, requiresApproval: decision.requiresApproval } : { allowed: false, reason: decision.reason };
  },
  getEffectivePermissions: async ({ principal, node, ceiling }) => {
    const result = await deps.access.forRequest().getEffectivePermissions({ principal: toPrincipal(principal), node: toNode(node), ...ceilingOf(ceiling) });
    return result.ok ? result.permissions : new Set<string>();
  },
});
