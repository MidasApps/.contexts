import type { NodeRef, Permission, Principal, RegionalSettings, TenantNodeRef } from "@core/contracts";
import type { RequestAccess } from "../../../access/composition.ts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import {
  type NodeDetails,
  regionalSettingsAt,
} from "../../../tenancy/application/use-cases/resolve-regional-settings.ts";
import type { MeDeps } from "../me-deps.ts";
import type { RegionalPreferences } from "../ports/driven/user-repository.ts";

/**
 * What a principal may do at a node and how to render it there (SP1 spec §10): the input
 * of SP3's agent `RequestContext`. `permissions` are the effective ones, sorted.
 */
export type ResolvedAccessContext = {
  readonly tenantId: TenantNodeRef["tenantId"];
  readonly projectId?: Extract<TenantNodeRef, { level: "project" }>["projectId"];
  readonly unitId?: Extract<TenantNodeRef, { level: "unit" }>["unitId"];
  readonly principal: Principal;
  readonly permissions: readonly Permission[];
  readonly regional: RegionalSettings;
};

/**
 * SP3 hook (SP1 spec §10). `node` may be any `NodeRef`; the platform level has no tenant
 * context.
 * @returns null when the principal may not read the node (`core.organization.read`), the
 *   node or its chain is gone, or the node is the platform: fail-closed, no permissions.
 * @throws on infrastructure failures (never resolves to a context on error).
 * @example const context = await resolveAccessContext({ principal, node: { level: "project", tenantId, projectId } });
 */
export type ResolveAccessContext = (input: {
  principal: Principal;
  node: NodeRef;
}) => Promise<ResolvedAccessContext | null>;

/** The resolved context plus the loaded nodes, for `GET /v1/me/context`. */
export type AccessContextResolution = { readonly context: ResolvedAccessContext; readonly details: NodeDetails };

export type LoadAccessContext = (input: {
  principal: Principal;
  node: TenantNodeRef;
  access: RequestAccess;
}) => Promise<Result<AccessContextResolution, AccessDeniedError>>;

type Deps = Pick<MeDeps, "users" | "loadNode">;

// A device or an API key renders with the node's settings; only users have preferences. A users
// doc without readable preferences renders with the node's settings too (fail-safe).
const preferencesOf = async (deps: Deps, principal: Principal): Promise<RegionalPreferences | undefined> =>
  principal.type === "user" ? deps.users.getRegionalPreferences(principal.uid) : undefined;

const nodeIds = (node: TenantNodeRef) => ({
  tenantId: node.tenantId,
  ...(node.level === "organization" ? {} : { projectId: node.projectId }),
  ...(node.level === "unit" ? { unitId: node.unitId } : {}),
});

/**
 * Authorizes `core.organization.read` at the node, then resolves the effective
 * permissions (grants inherited from the organization down), loads the node chain and
 * resolves regional settings (user preference → nearest node → organization).
 */
export const makeLoadAccessContext =
  (deps: Deps): LoadAccessContext =>
  async ({ principal, node, access }) => {
    const decision = await access.authorize({ principal, permission: "core.organization.read", node });
    if (!decision.allowed) return err(new AccessDeniedError(decision.reason));
    const effective = await access.getEffectivePermissions({ principal, node });
    if (!effective.ok) return err(new AccessDeniedError(effective.reason));
    const [details, preferences] = await Promise.all([deps.loadNode(node), preferencesOf(deps, principal)]);
    if (details === null) return err(new AccessDeniedError("NODE_NOT_FOUND"));
    const context: ResolvedAccessContext = {
      ...nodeIds(node),
      principal,
      permissions: [...effective.permissions].sort(),
      regional: regionalSettingsAt(details, preferences),
    };
    return ok({ context, details });
  };

/** Binds `resolveAccessContext` to a fresh request scope per call (reads memoized per call only). */
export const makeResolveAccessContext = (deps: Deps & Pick<MeDeps, "access">): ResolveAccessContext => {
  const load = makeLoadAccessContext(deps);
  return async ({ principal, node }) => {
    if (node.level === "platform") return null;
    const resolved = await load({ principal, node, access: deps.access.forRequest() });
    return resolved.ok ? resolved.data.context : null;
  };
};
