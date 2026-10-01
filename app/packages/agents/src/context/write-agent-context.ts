import { type AgentRequestContext, AgentRequestContextSchema, PrincipalSchema } from "@core/contracts";
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import { z } from "zod";
import { type AgentPrincipal, resourceIdOf } from "../auth/agent-principal.ts";
import { CONVERSATION_ID_PATTERN } from "../auth/conversation-id.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";
import { AGENT_CONTEXT_KEYS, AGENT_PRINCIPAL_KEY, SERVER_ONLY_CONTEXT_KEYS } from "./agent-request-context.ts";

/**
 * Write side of the typed agent context (spec §4.3, decision 0019): only the
 * context middleware calls these, with a principal verified by
 * `FirebaseMastraAuth`. Nothing here trusts a value the client sent.
 */

/** Mutable surface of Mastra's `RequestContext` the middleware needs (a `Map` also fits). */
export type RequestContextStore = {
  readonly get: (key: string) => unknown;
  readonly set: (key: string, value: unknown) => void;
  readonly delete: (key: string) => boolean;
};

/**
 * Agents' `requestContextSchema`: the contract keys plus the verified principal.
 * Loose on purpose: Mastra keeps its own keys (`user`, `mastra__*`) in the same
 * context, so a strict object would reject every run.
 */
export const AgentRuntimeContextSchema = z
  .looseObject({ ...AgentRequestContextSchema.def.shape, [AGENT_PRINCIPAL_KEY]: PrincipalSchema })
  .refine((context) => context.organizationId === context.tenantId, { error: "organizationId must equal tenantId.", path: ["organizationId"] });

const optionalEntries = (principal: AgentPrincipal, conversationId: string | undefined) => ({
  ...(principal.projectId === undefined ? {} : { projectId: principal.projectId }),
  ...(principal.unitId === undefined ? {} : { unitId: principal.unitId }),
  ...(principal.activeScreen === undefined ? {} : { activeScreen: principal.activeScreen }),
  ...(conversationId !== undefined && CONVERSATION_ID_PATTERN.test(conversationId) ? { conversationId } : {}),
});

/**
 * Builds the context of one run from the verified principal.
 * @param args.requestId the resolved `X-Request-Id` (ULID).
 * @param args.conversationId forwarded conversation id; ignored when malformed.
 * @returns `null` without membership, tenant or regional settings (the request then gets no context and fails closed).
 */
export const buildAgentRequestContext = (args: {
  principal: AgentPrincipal;
  requestId: string;
  aiMode: AgentRequestContext["aiMode"];
  conversationId?: string;
}): AgentRequestContext | null => {
  const { principal, requestId, aiMode, conversationId } = args;
  if (!principal.isMember || principal.tenantId === null || principal.regional === null) return null;
  const parsed = AgentRequestContextSchema.safeParse({
    tenantId: principal.tenantId,
    userId: principal.uid,
    principalKind: principal.kind,
    permissions: [...principal.permissions].sort(),
    ...principal.regional,
    requestId,
    organizationId: principal.tenantId,
    aiMode,
    ...optionalEntries(principal, conversationId),
  });
  return parsed.success ? parsed.data : null;
};

/** Removes every key the middleware owns, so a client-sent value never survives. */
export const clearAgentContext = (store: RequestContextStore): void => {
  for (const key of [...AGENT_CONTEXT_KEYS, AGENT_PRINCIPAL_KEY, MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, ...SERVER_ONLY_CONTEXT_KEYS]) store.delete(key);
};

/**
 * Writes one key per context field, the principal, `MASTRA_RESOURCE_ID_KEY`
 * (`tenantId:uid`) and, with a conversation, `MASTRA_THREAD_ID_KEY`.
 */
export const writeAgentContext = (store: RequestContextStore, snapshot: { context: AgentRequestContext; principal: AccessPrincipal }): void => {
  const { context, principal } = snapshot;
  clearAgentContext(store);
  for (const [key, value] of Object.entries(context)) store.set(key, value);
  store.set(AGENT_PRINCIPAL_KEY, principal);
  store.set(MASTRA_RESOURCE_ID_KEY, resourceIdOf({ tenantId: context.tenantId, uid: context.userId }));
  if (context.conversationId !== undefined) store.set(MASTRA_THREAD_ID_KEY, context.conversationId);
};
