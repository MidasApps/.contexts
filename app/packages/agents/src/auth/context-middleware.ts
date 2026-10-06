import { type AgentRequestContext, FORWARDED_HEADERS } from "@core/contracts";
import { resolveRequestId } from "@core/services";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { buildAgentRequestContext, clearAgentContext, writeAgentContext } from "../context/write-agent-context.ts";
import { withServerTracingOptions } from "../observability/trace-context.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";
import { type AgentMiddleware, apiPathPattern } from "./agent-middleware.ts";
import type { AgentPrincipal } from "./agent-principal.ts";
import { readBearerToken } from "./bearer-only.ts";
import { CONVERSATION_ID_PATTERN, newConversationId, startsConversationRun } from "./conversation-id.ts";
import {
  checkThreadAccess,
  type ThreadAccess,
  type ThreadOwnerLookup,
  threadIdsOfRequest,
} from "./thread-ownership.ts";

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
  /** Mount path; defaults to the API prefix (`/api/*`). The chat routes mount a second instance on `/chat/*`. */
  readonly path?: string;
  /**
   * Body cap checked before anything reads the body (the tracing step parses JSON bodies): a
   * larger declared `Content-Length` answers 413, a body without one 411. The chat instance sets
   * the chat route's cap, so an oversized body is never buffered (defense in depth behind `/v1`).
   */
  readonly maxBodyBytes?: number;
  /**
   * AI kill-switch (decision 0039): once the caller's context is known, a path it applies to
   * answers 503 `FEATURE_DISABLED` when `ai.kill-switch` is on for the environment or the tenant.
   */
  readonly killSwitch?: KillSwitch;
};

export type KillSwitch = {
  readonly appliesTo: (pathname: string) => boolean;
  /** Fails closed: a store failure with nothing cached counts as killed. */
  readonly isKilled: (tenantId: string) => Promise<boolean>;
};

const killedResponse = async (
  killSwitch: KillSwitch | undefined,
  request: Request,
  context: AgentRequestContext,
): Promise<Response | undefined> => {
  if (killSwitch === undefined || !killSwitch.appliesTo(new URL(request.url).pathname)) return undefined;
  if (!(await killSwitch.isKilled(context.tenantId))) return undefined;
  return Response.json(
    { error: { code: "FEATURE_DISABLED", message: "This feature is turned off.", requestId: context.requestId } },
    { status: 503 },
  );
};

const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH"]);

const bodyRefusal = (request: Request, maxBodyBytes: number | undefined): Response | undefined => {
  if (maxBodyBytes === undefined || !BODY_METHODS.has(request.method) || request.body === null) return undefined;
  const requestId = resolveRequestId(readHeader(request, FORWARDED_HEADERS.requestId));
  const declared = readHeader(request, "content-length");
  if (declared === undefined) {
    return Response.json(
      { error: { code: "VALIDATION_FAILED", message: "Content-Length is required.", requestId } },
      { status: 411 },
    );
  }
  const length = Number(declared);
  if (Number.isSafeInteger(length) && length >= 0 && length <= maxBodyBytes) return undefined;
  return Response.json(
    { error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large.", requestId } },
    { status: 413 },
  );
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

type Snapshot = { context: AgentRequestContext; principal: AccessPrincipal; createdConversationId?: string };

/**
 * The conversation of the request: the forwarded id, or a new one when the request starts
 * a run that needs a memory thread (follow-up #24). A fresh id names no thread yet, so the
 * run creates it under the caller's own resource (`tenantId:uid`).
 */
const conversationOf = (
  options: ContextMiddlewareOptions,
  request: Request,
): { id?: string; created: boolean } | "malformed" => {
  const forwarded = readHeader(request, FORWARDED_HEADERS.conversationId);
  if (forwarded !== undefined)
    return CONVERSATION_ID_PATTERN.test(forwarded) ? { id: forwarded, created: false } : "malformed";
  return startsConversationRun(request, options.apiPrefix)
    ? { id: newConversationId(), created: true }
    : { created: false };
};

const resolveSnapshot = async (
  options: ContextMiddlewareOptions,
  request: Request,
): Promise<Snapshot | "malformed" | null> => {
  const principal = await authenticate(options.auth, request);
  if (principal === null) return null;
  const conversation = conversationOf(options, request);
  if (conversation === "malformed") return "malformed";
  const context = buildAgentRequestContext({
    principal,
    requestId: resolveRequestId(readHeader(request, FORWARDED_HEADERS.requestId)),
    aiMode: options.aiMode,
    ...(conversation.id === undefined ? {} : { conversationId: conversation.id }),
  });
  if (context === null) return null;
  return {
    context,
    principal: principal.principal,
    ...(conversation.created && conversation.id !== undefined ? { createdConversationId: conversation.id } : {}),
  };
};

const REFUSALS: Record<Exclude<ThreadAccess, "allowed">, { status: number; code: string; message: string }> = {
  forbidden: { status: 403, code: "FORBIDDEN", message: "You do not have access to this conversation." },
  unavailable: { status: 503, code: "UPSTREAM_UNAVAILABLE", message: "The service is unavailable." },
};

// The api.md §6 envelope, with the forwarded request id.
const refusal = (request: Request, status: number, code: string, message: string): Response =>
  Response.json(
    { error: { code, message, requestId: resolveRequestId(readHeader(request, FORWARDED_HEADERS.requestId)) } },
    { status },
  );

// A thread of another resource (tenant:uid) is refused before the run (Mastra would fail it with 500).
const refuseForeignThread = async (
  options: ContextMiddlewareOptions,
  request: Request,
  resourceId: unknown,
): Promise<Response | undefined> => {
  if (options.threadOwnerOf === undefined || typeof resourceId !== "string") return undefined;
  const threadIds = threadIdsOfRequest({
    path: new URL(request.url).pathname,
    conversationId: readHeader(request, FORWARDED_HEADERS.conversationId),
  });
  if (threadIds.length === 0) return undefined;
  const access = await checkThreadAccess({ lookup: options.threadOwnerOf, threadIds, resourceId });
  if (access === "allowed") return undefined;
  const refused = REFUSALS[access];
  return refusal(request, refused.status, refused.code, refused.message);
};

/**
 * Mastra server middleware (spec §4.3, decision 0019) that turns the verified
 * principal into the typed `AgentRequestContext`. It runs before Mastra's route
 * auth, so it authenticates through the same provider (one verification per
 * request). It always clears the keys it owns first: a client-sent
 * `requestContext` never survives. Without a principal or membership it writes
 * nothing and lets the route auth answer 401/403. It also replaces any body
 * `tracingOptions` with the forwarded `traceparent` (`trace-context.ts`), and answers
 * 403 for a memory thread of another resource (`thread-ownership.ts`). A run without a
 * conversation gets a new one, returned in `X-Conversation-Id`; a malformed id answers 400.
 */
export const createContextMiddleware = (options: ContextMiddlewareOptions): AgentMiddleware => ({
  path: options.path ?? apiPathPattern(options.apiPrefix),
  handler: async (context, next) => {
    const refused = bodyRefusal(context.req.raw, options.maxBodyBytes);
    if (refused !== undefined) return refused;
    const store = context.get("requestContext");
    clearAgentContext(store);
    // Before authentication, so the route auth sees (and memoizes) the same request object.
    context.req.raw = await withServerTracingOptions(context.req.raw);
    const snapshot = await resolveSnapshot(options, context.req.raw);
    if (snapshot === "malformed")
      return refusal(context.req.raw, 400, "VALIDATION_FAILED", "The conversation id is not valid.");
    if (snapshot !== null) {
      const killed = await killedResponse(options.killSwitch, context.req.raw, snapshot.context);
      if (killed !== undefined) return killed;
      writeAgentContext(store, snapshot);
      // Before `next()`: Hono folds headers set here into streamed answers too.
      if (snapshot.createdConversationId !== undefined)
        context.header?.(FORWARDED_HEADERS.conversationId, snapshot.createdConversationId);
      const refusal = await refuseForeignThread(options, context.req.raw, store.get(MASTRA_RESOURCE_ID_KEY));
      if (refusal !== undefined) return refusal;
    }
    await next();
    return undefined;
  },
});
