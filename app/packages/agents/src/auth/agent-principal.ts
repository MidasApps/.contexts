import { ACTIVE_SCREEN_MAX_LENGTH } from "@core/contracts";
import type { AccessContext, AccessPrincipal, NodeRef, RegionalSettings } from "../runtime/runtime-ports.ts";

/**
 * The authenticated caller of a Mastra request (spec §4.2). Mastra stores it as
 * the request `user`; the context middleware (Task 7) turns it into the typed
 * `AgentRequestContext`.
 */
export type AgentPrincipal = {
  readonly kind: "user" | "service";
  /** Firebase uid; for API keys, the key owner's uid (SP1 §5.2 step 3). */
  readonly uid: string;
  /** SP1 principal, passed back to `authorize()`. */
  readonly principal: AccessPrincipal;
  /** `null` when the request named no tenant. */
  readonly tenantId: string | null;
  readonly projectId?: string;
  readonly unitId?: string;
  /** Whether SP1 found a membership on the node; false → no permissions (403). */
  readonly isMember: boolean;
  readonly permissions: ReadonlySet<string>;
  readonly regional: RegionalSettings | null;
  readonly activeScreen?: string;
};

export type ForwardedScope = {
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly unitId?: string;
  readonly activeScreen?: string;
};

/** Principal kinds that may run agents; devices are not (they have no user to act for). */
export const principalIdentity = (principal: AccessPrincipal): { kind: AgentPrincipal["kind"]; uid: string } | null => {
  if (principal.type === "user") return { kind: "user", uid: principal.uid };
  if (principal.type === "service") return { kind: "service", uid: principal.ownerUid };
  return null;
};

/** Node named by the forwarded headers; a unit without its project names nothing (fail-closed). */
export const nodeFromScope = (scope: ForwardedScope): NodeRef | null => {
  const { tenantId, projectId, unitId } = scope;
  if (tenantId === undefined) return null;
  if (unitId !== undefined) return projectId === undefined ? null : { level: "unit", tenantId, projectId, unitId };
  return projectId === undefined ? { level: "organization", tenantId } : { level: "project", tenantId, projectId };
};

const activeScreenOf = (scope: ForwardedScope): { activeScreen?: string } =>
  scope.activeScreen === undefined ? {} : { activeScreen: scope.activeScreen.slice(0, ACTIVE_SCREEN_MAX_LENGTH) };

/**
 * Builds the principal from SP1's verified identity and access context.
 * @param context `null` when there is no membership (or no node): the principal gets no permissions.
 */
export const buildAgentPrincipal = (args: {
  principal: AccessPrincipal;
  identity: { kind: AgentPrincipal["kind"]; uid: string };
  scope: ForwardedScope;
  context: AccessContext | null;
}): AgentPrincipal => {
  const { principal, identity, scope, context } = args;
  const base = { ...identity, principal, ...activeScreenOf(scope) };
  if (context === null) {
    return { ...base, tenantId: scope.tenantId ?? null, isMember: false, permissions: new Set(), regional: null };
  }
  return {
    ...base,
    tenantId: context.tenantId,
    ...(context.projectId === undefined ? {} : { projectId: context.projectId }),
    ...(context.unitId === undefined ? {} : { unitId: context.unitId }),
    isMember: true,
    permissions: new Set(context.permissions),
    regional: context.regional,
  };
};

/** Resource id prefix for principals without tenant; Firestore automatic ids never equal it. */
export const UNSCOPED_RESOURCE_PREFIX = "unscoped";

/** Memory resource of a principal: `tenantId:uid` (decision 0020), so memory never crosses tenants. */
export const resourceIdOf = (principal: Pick<AgentPrincipal, "tenantId" | "uid">): string => `${principal.tenantId ?? UNSCOPED_RESOURCE_PREFIX}:${principal.uid}`;
