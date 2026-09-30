import { type AgentRequestContext, AgentRequestContextSchema, PrincipalSchema } from "@core/contracts";
import type { AccessPrincipal, NodeRef } from "../runtime/runtime-ports.ts";

/**
 * Typed view of Mastra's `RequestContext` (spec §4.3, decision 0019). The
 * context middleware (Task 7) writes one key per `AgentRequestContext` field
 * plus the verified SP1 principal; tools only read them through
 * `readAgentContext`, which never falls back to a default tenant.
 */

/** Keys of `AgentRequestContext`, each stored as its own request-context key (Mastra processors read `organizationId`). */
export const AGENT_CONTEXT_KEYS = Object.keys(AgentRequestContextSchema.def.shape) as readonly (keyof AgentRequestContext)[];

/** Key of the verified SP1 principal (passed back to `authorize()`); set only by the server. */
export const AGENT_PRINCIPAL_KEY = "corePrincipal";

/** Minimal read surface of Mastra's `RequestContext` (also satisfied by a `Map`). */
export type RequestContextReader = { readonly get: (key: string) => unknown };

export type AgentContextSnapshot = {
  readonly context: AgentRequestContext;
  readonly principal: AccessPrincipal;
};

export type ReadAgentContextResult =
  | { readonly ok: true; readonly data: AgentContextSnapshot }
  | { readonly ok: false; readonly missing: readonly string[] };

const collectFields = (requestContext: RequestContextReader): Record<string, unknown> => {
  const entries = AGENT_CONTEXT_KEYS.map((key) => [key, requestContext.get(key)] as const);
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
};

/** The principal must be the caller the context names: same uid (key owner for services) and tenant. */
const principalMatches = (principal: AccessPrincipal, context: AgentRequestContext): boolean => {
  if (principal.type === "user") return context.principalKind === "user" && principal.uid === context.userId;
  if (principal.type === "service") {
    return context.principalKind === "service" && principal.ownerUid === context.userId && principal.tenantId === context.tenantId;
  }
  return false;
};

/**
 * Reads and validates the typed agent context.
 * @returns `ok: false` with the invalid or missing keys; callers fail closed (`CONTEXT_MISSING`).
 */
export const readAgentContext = (requestContext: RequestContextReader | undefined): ReadAgentContextResult => {
  if (requestContext === undefined) return { ok: false, missing: [...AGENT_CONTEXT_KEYS, AGENT_PRINCIPAL_KEY] };
  const context = AgentRequestContextSchema.safeParse(collectFields(requestContext));
  const principal = PrincipalSchema.safeParse(requestContext.get(AGENT_PRINCIPAL_KEY));
  const missing = [
    ...(context.success ? [] : [...new Set(context.error.issues.map((issue) => String(issue.path[0] ?? "context")))]),
    ...(principal.success ? [] : [AGENT_PRINCIPAL_KEY]),
  ];
  if (!context.success || !principal.success) return { ok: false, missing };
  // The contract schema is the SP1 principal; the port type mirrors it without brands.
  const verified = principal.data as AccessPrincipal;
  if (!principalMatches(verified, context.data)) return { ok: false, missing: [AGENT_PRINCIPAL_KEY] };
  return { ok: true, data: { context: context.data, principal: verified } };
};

/** SP1 node the context is scoped to: unit, project or organization. */
export const nodeOfContext = (context: AgentRequestContext): NodeRef => {
  const { tenantId, projectId, unitId } = context;
  if (projectId !== undefined && unitId !== undefined) return { level: "unit", tenantId, projectId, unitId };
  if (projectId !== undefined) return { level: "project", tenantId, projectId };
  return { level: "organization", tenantId };
};
