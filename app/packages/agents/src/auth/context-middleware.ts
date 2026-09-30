import { type AgentRequestContext, FORWARDED_HEADERS } from "@core/contracts";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { resolveRequestId } from "@core/services";
import { buildAgentRequestContext, clearAgentContext, writeAgentContext } from "../context/write-agent-context.ts";
import { withServerTracingOptions } from "../observability/trace-context.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";
import { type AgentMiddleware, apiPathPattern } from "./agent-middleware.ts";
import type { AgentPrincipal } from "./agent-principal.ts";
import { readBearerToken } from "./bearer-only.ts";
import { checkThreadAccess, type ThreadAccess, threadIdsOfRequest, type ThreadOwnerLookup } from "./thread-ownership.ts";

/** What the middleware needs from `FirebaseMastraAuth` (memoized per request there). */
export type ContextAuthenticator = {
  readonly authenticateToken: (token: string, request: Request) => Promise<AgentPrincipal | null>;
};

export type ContextMiddlewareOptions = {
  readonly auth: ContextAuthenticator;
  readonly aiMode: AgentRequestContext["aiMode"];
  /** Mastra `server.apiPrefix` (default `/api`). */
  readonly apiPrefix?: string;
  /** Memory thread owners; without it thread ownership is left to Mastra. */
  readonly threadOwnerOf?: ThreadOwnerLookup;
};

const readHeader = (request: Request, name: string): string | undefined => {
  const value = request.headers.get(name)?.trim();
  return value === undefined || value === "" ? undefined : value;
};

// A verification error counts as "no principal" here; Mastra's route auth runs the
// same (memoized) verification next and answers 401, so this never widens access.
const authenticate = async (auth: ContextAuthenticator, request: Request): Promise<AgentPrincipal | null> => {
  const token = readBearerToken(request);
  if (token === undefined) return null;
  try {
    return await auth.authenticateToken(token, request);
  } catch {
    return null;
  }
};

const resolveSnapshot = async (
  options: ContextMiddlewareOptions,
  request: Request,
): Promise<{ context: AgentRequestContext; principal: AccessPrincipal } | null> => {
  const principal = await authenticate(options.auth, request);
  if (principal === null) return null;
  const conversationId = readHeader(request, FORWARDED_HEADERS.conversationId);
  const context = buildAgentRequestContext({
    principal,
    requestId: resolveRequestId(readHeader(request, FORWARDED_HEADERS.requestId)),
    aiMode: options.aiMode,
    ...(conversationId === undefined ? {} : { conversationId }),
  });
  return context === null ? null : { context, principal: principal.principal };
};

const REFUSALS: Record<Exclude<ThreadAccess, "allowed">, { status: number; error: string }> = {
  forbidden: { status: 403, error: "Forbidden" },
  unavailable: { status: 503, error: "Service unavailable" },
};

// A thread of another resource (tenant:uid) is refused before the run (Mastra would fail it with 500).
const refuseForeignThread = async (options: ContextMiddlewareOptions, request: Request, resourceId: unknown): Promise<Response | undefined> => {
  if (options.threadOwnerOf === undefined || typeof resourceId !== "string") return undefined;
  const threadIds = threadIdsOfRequest({ path: new URL(request.url).pathname, conversationId: readHeader(request, FORWARDED_HEADERS.conversationId) });
  if (threadIds.length === 0) return undefined;
  const access = await checkThreadAccess({ lookup: options.threadOwnerOf, threadIds, resourceId });
  if (access === "allowed") return undefined;
  const refusal = REFUSALS[access];
  return Response.json({ error: refusal.error }, { status: refusal.status });
};

/**
 * Mastra server middleware (spec §4.3, decision 0019) that turns the verified
 * principal into the typed `AgentRequestContext`. It runs before Mastra's route
 * auth, so it authenticates through the same provider (one verification per
 * request). It always clears the keys it owns first: a client-sent
 * `requestContext` never survives. Without a principal or membership it writes
 * nothing and lets the route auth answer 401/403. It also replaces any body
 * `tracingOptions` with the forwarded `traceparent` (`trace-context.ts`), and answers
 * 403 for a memory thread of another resource (`thread-ownership.ts`).
 */
export const createContextMiddleware = (options: ContextMiddlewareOptions): AgentMiddleware => ({
  path: apiPathPattern(options.apiPrefix),
  handler: async (context, next) => {
    const store = context.get("requestContext");
    clearAgentContext(store);
    // Before authentication, so the route auth sees (and memoizes) the same request object.
    context.req.raw = await withServerTracingOptions(context.req.raw);
    const snapshot = await resolveSnapshot(options, context.req.raw);
    if (snapshot !== null) {
      writeAgentContext(store, snapshot);
      const refusal = await refuseForeignThread(options, context.req.raw, store.get(MASTRA_RESOURCE_ID_KEY));
      if (refusal !== undefined) return refusal;
    }
    await next();
    return undefined;
  },
});
