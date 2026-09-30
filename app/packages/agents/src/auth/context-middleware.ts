import { type AgentRequestContext, FORWARDED_HEADERS } from "@core/contracts";
import { resolveRequestId } from "@core/services";
import { buildAgentRequestContext, clearAgentContext, writeAgentContext } from "../context/write-agent-context.ts";
import { withServerTracingOptions } from "../observability/trace-context.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";
import { type AgentMiddleware, apiPathPattern } from "./agent-middleware.ts";
import type { AgentPrincipal } from "./agent-principal.ts";
import { readBearerToken } from "./bearer-only.ts";

/** What the middleware needs from `FirebaseMastraAuth` (memoized per request there). */
export type ContextAuthenticator = {
  readonly authenticateToken: (token: string, request: Request) => Promise<AgentPrincipal | null>;
};

export type ContextMiddlewareOptions = {
  readonly auth: ContextAuthenticator;
  readonly aiMode: AgentRequestContext["aiMode"];
  /** Mastra `server.apiPrefix` (default `/api`). */
  readonly apiPrefix?: string;
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

/**
 * Mastra server middleware (spec §4.3, decision 0019) that turns the verified
 * principal into the typed `AgentRequestContext`. It runs before Mastra's route
 * auth, so it authenticates through the same provider (one verification per
 * request). It always clears the keys it owns first: a client-sent
 * `requestContext` never survives. Without a principal or membership it writes
 * nothing and lets the route auth answer 401/403. It also replaces any body
 * `tracingOptions` with the forwarded `traceparent` (`trace-context.ts`).
 */
export const createContextMiddleware = (options: ContextMiddlewareOptions): AgentMiddleware => ({
  path: apiPathPattern(options.apiPrefix),
  handler: async (context, next) => {
    const store = context.get("requestContext");
    clearAgentContext(store);
    // Before authentication, so the route auth sees (and memoizes) the same request object.
    context.req.raw = await withServerTracingOptions(context.req.raw);
    const snapshot = await resolveSnapshot(options, context.req.raw);
    if (snapshot !== null) writeAgentContext(store, snapshot);
    await next();
    return undefined;
  },
});
