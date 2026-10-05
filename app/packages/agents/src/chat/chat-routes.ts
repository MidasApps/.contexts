import { randomUUID } from "node:crypto";
import { type ChatStreamDefaultOptions, handleChatStream, withSseHeartbeat } from "@mastra/ai-sdk";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { handleAbort } from "./abort-route.ts";
import { type ChatRouteDeps, callerOf, chatError, durableIdOf, readCappedJson } from "./chat-http.ts";
import { type ChatRouteBody, ChatRouteBodySchema } from "./chat-request.schema.ts";
import { approvalRunIdsOf, type PendingUserMessage } from "./chat-run-owners.ts";
import { handleMessages, handleSummary, MESSAGES_ROUTE_PATH, SUMMARY_ROUTE_PATH } from "./history-routes.ts";
import { handleObserve } from "./observe-route.ts";
import { createChatStreamTap } from "./tool-preview.ts";

export { handleAbort } from "./abort-route.ts";
export { handleMessages, handleSummary, MESSAGES_ROUTE_PATH, SUMMARY_ROUTE_PATH } from "./history-routes.ts";
export { handleObserve } from "./observe-route.ts";

/** Custom routes live outside the Mastra API prefix; `/v1/chat` reaches them through the gateway. */
export const CHAT_ROUTE_PATH = "/chat/:agentId";
export const OBSERVE_ROUTE_PATH = "/chat/:agentId/runs/:runId/observe";
export const ABORT_ROUTE_PATH = "/chat/runs/:runId/abort";
/** Middleware pattern of every chat route (context middleware, spec §4.2). */
export const CHAT_ROUTES_PATTERN = "/chat/*";
/** Proxies close idle streams; spec §4.2 asks for a 15 s heartbeat. */
export const CHAT_HEARTBEAT_MS = 15_000;
/**
 * `/v1` inlines up to 10 attachments of ≤ 10 MB as data URLs (decision 0035), about 134 MB of
 * base64; Mastra's `bodySizeLimit` skips custom routes, so the route caps the body itself.
 */
export const MAX_CHAT_BODY_BYTES = 140 * 1024 * 1024;

export type ChatPostInput = {
  readonly request: Request;
  readonly agentId: string;
  readonly requestContext: RequestContext<unknown>;
  readonly mastra: Mastra;
};

type Caller = { readonly resourceId: string; readonly threadId: string };
type RunIdResult = { readonly runId: string } | { readonly refusal: "invalid" | "forbidden" };

const CHAT_RUN_OPTIONS: ChatStreamDefaultOptions<unknown> = { closeOnSuspend: true };

const issuesOf = (error: { issues: readonly { path: readonly PropertyKey[]; code: string }[] }) =>
  error.issues.map((issue) => ({ field: issue.path.map(String).join(".") || "body", issue: issue.code.toUpperCase() }));

/**
 * Run id of the request: a new one for a user message; for an assistant message (a native
 * approval response, decision 0032) the one run its approvals name, which must be the caller's.
 */
const runIdOf = (body: ChatRouteBody, caller: Caller, deps: ChatRouteDeps): RunIdResult => {
  const message = body.messages[0];
  if (message === undefined) return { refusal: "invalid" };
  if (message.role === "user") return { runId: (deps.newRunId ?? randomUUID)() };
  const runIds = approvalRunIdsOf(message.parts);
  const [runId] = runIds;
  if (runId === undefined || runIds.length > 1) return { refusal: "invalid" };
  return deps.owners.isOwnedBy(runId, caller) ? { runId } : { refusal: "forbidden" };
};

/** The text of the member's message, kept while its run answers (the attachments stay out of memory). */
const pendingMessageOf = (message: ChatRouteBody["messages"][number]): PendingUserMessage | undefined => {
  const parts = message.parts as readonly { readonly type?: unknown; readonly text?: unknown }[];
  const text = parts
    .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n");
  return typeof message.id === "string" && text !== "" ? { id: message.id, text } : undefined;
};

const streamRun = async (
  input: ChatPostInput,
  deps: ChatRouteDeps,
  args: { durableId: string; body: ChatRouteBody; caller: Caller; runId: string },
) => {
  const { body, caller, runId } = args;
  const stream = await handleChatStream({
    mastra: input.mastra,
    agentId: args.durableId,
    version: "v7",
    sendReasoning: true,
    sendSources: true,
    // The request signal is not forwarded: a client disconnect must not end the run (resume
    // observes it); stop is the abort route. A durable agent reads the thread only from `memory`.
    params: {
      messages: body.messages as unknown as UIMessage[],
      ...(body.trigger === undefined ? {} : { trigger: body.trigger }),
      runId,
      memory: { thread: caller.threadId, resource: caller.resourceId },
      requestContext: input.requestContext,
    },
    // `closeOnSuspend` ends the stream at a tool approval so `useChat` reaches `ready`.
    defaultOptions: CHAT_RUN_OPTIONS,
  });
  const tap = createChatStreamTap({
    previewer: deps.previewer,
    requestContext: input.requestContext,
    onState: (state) => deps.owners.markState(runId, state),
  });
  return stream.pipeThrough(tap);
};

/**
 * `POST /chat/:agentId`: the AI SDK UI message stream of a durable chat agent (decision 0031).
 * The body gives only the last message and the trigger; the run id, the memory thread and
 * resource come from the server. Answers `x-run-id`.
 */
export const handleChatPost = async (input: ChatPostInput, deps: ChatRouteDeps): Promise<Response> => {
  const { requestContext } = input;
  const durableId = await durableIdOf(deps, input.agentId, requestContext);
  if (durableId === undefined) return chatError("NOT_FOUND", requestContext);
  const { resourceId, threadId } = callerOf(requestContext);
  if (resourceId === undefined) return chatError("FORBIDDEN", requestContext);
  if (threadId === undefined)
    return chatError("VALIDATION_FAILED", requestContext, [{ field: "x-conversation-id", issue: "REQUIRED" }]);
  const raw = await readCappedJson(input.request, MAX_CHAT_BODY_BYTES);
  if (raw === "too-large") return chatError("PAYLOAD_TOO_LARGE", requestContext);
  const parsed = ChatRouteBodySchema.safeParse(raw);
  if (!parsed.success) return chatError("VALIDATION_FAILED", requestContext, issuesOf(parsed.error));
  const caller = { resourceId, threadId };
  const resolved = runIdOf(parsed.data, caller, deps);
  if ("refusal" in resolved) {
    return resolved.refusal === "forbidden"
      ? chatError("FORBIDDEN", requestContext)
      : chatError("VALIDATION_FAILED", requestContext, [{ field: "messages.0.parts", issue: "APPROVAL_REQUIRED" }]);
  }
  const { runId } = resolved;
  const first = parsed.data.messages[0];
  // A new message would leave the waiting tool call unanswered (and the history invalid for the model).
  if (first?.role === "user" && deps.owners.awaitsApproval(caller))
    return chatError("CONFLICT", requestContext, [{ field: "messages.0", issue: "APPROVAL_PENDING" }]);
  if (first?.role === "user")
    deps.owners.record(runId, { ...caller, agentId: input.agentId, userMessage: pendingMessageOf(first) });
  try {
    const stream = await streamRun(input, deps, { durableId, body: parsed.data, caller, runId });
    const response = createUIMessageStreamResponse({ stream, headers: { "x-run-id": runId } });
    return withSseHeartbeat(response, deps.heartbeatMs ?? CHAT_HEARTBEAT_MS);
  } catch (error: unknown) {
    deps.owners.markState(runId, "finished");
    deps.logger.error("chat_stream_failed", { requestId: requestContext.get("requestId"), runId, err: error });
    return chatError("INTERNAL_ERROR", requestContext);
  }
};

const inputsOf = (context: { readonly get: (key: "mastra" | "requestContext") => unknown }) => ({
  mastra: context.get("mastra") as Mastra,
  requestContext: context.get("requestContext") as RequestContext<unknown>,
});

/** The chat routes (spec §4.1, §4.2, decision 0031): all require Mastra auth (`core.chat.use`). */
export const createChatRoutes = (deps: ChatRouteDeps): ApiRoute[] => [
  registerApiRoute(CHAT_ROUTE_PATH, {
    method: "POST",
    requiresAuth: true,
    handler: (context) =>
      handleChatPost({ ...inputsOf(context), request: context.req.raw, agentId: context.req.param("agentId") }, deps),
  }),
  registerApiRoute(OBSERVE_ROUTE_PATH, {
    method: "GET",
    requiresAuth: true,
    handler: (context) =>
      handleObserve(
        { ...inputsOf(context), agentId: context.req.param("agentId"), runId: context.req.param("runId") },
        deps,
      ),
  }),
  registerApiRoute(ABORT_ROUTE_PATH, {
    method: "POST",
    requiresAuth: true,
    handler: (context) => handleAbort({ ...inputsOf(context), runId: context.req.param("runId") }, deps),
  }),
  registerApiRoute(MESSAGES_ROUTE_PATH, {
    method: "GET",
    requiresAuth: true,
    handler: (context) =>
      handleMessages(
        { ...inputsOf(context), agentId: context.req.param("agentId"), url: new URL(context.req.url) },
        deps,
      ),
  }),
  registerApiRoute(SUMMARY_ROUTE_PATH, {
    method: "POST",
    requiresAuth: true,
    handler: (context) =>
      handleSummary(
        { ...inputsOf(context), agentId: context.req.param("agentId"), url: new URL(context.req.url) },
        deps,
      ),
  }),
];
