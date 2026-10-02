import { CUSTOM_AGENT_RUNTIME_ID } from "@core/contracts";
import { z } from "zod";
import type { GatewayResult } from "../../application/ports/agent-runtime-gateway.ts";
import type { ChatMessagesPage, ChatRuntimeGateway, ChatStreamAnswer } from "../../application/ports/chat-runtime-gateway.ts";
import { UPSTREAM_UNAVAILABLE } from "./mastra-error-mapper.ts";
import { clientFor, connectionOf, type MastraGatewayOptions } from "./mastra-gateway.ts";
import { callRawRoute, holdUpstreamBody, type MastraConnection, withDeadline } from "./mastra-request.ts";

/** Paths of the Mastra chat routes (`@core/agents` `chat-routes.ts`, decision 0031). */
export const CHAT_ROUTES = {
  send: (agentId: string) => `/chat/${encodeURIComponent(agentId)}`,
  observe: (agentId: string, runId: string) => `/chat/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/observe`,
  abort: (runId: string) => `/chat/runs/${encodeURIComponent(runId)}/abort`,
  messages: (agentId: string, page: number, perPage: number) => `/chat/${encodeURIComponent(agentId)}/messages?page=${page}&perPage=${perPage}`,
  summary: (agentId: string) => `/chat/${encodeURIComponent(agentId)}/summary`,
} as const;

/**
 * Agent whose memory holds the thread of a conversation: every custom agent runs on one
 * registered Mastra agent (decision 0046), so the memory routes of Mastra know only that id.
 */
export const memoryAgentIdOf = (agentId: string): string => (agentId === "assistant" ? agentId : CUSTOM_AGENT_RUNTIME_ID);

const SSE = "text/event-stream";

const streamOf = (response: Response): ChatStreamAnswer | null => {
  if (response.status === 204 || response.body === null) return null;
  return {
    body: holdUpstreamBody(response.body),
    contentType: response.headers.get("content-type") ?? SSE,
    runId: response.headers.get("x-run-id"),
    streamProtocol: response.headers.get("x-vercel-ai-ui-message-stream"),
  };
};

// Mastra's JSON answers are data, not trusted shapes: parse the part `/v1` uses.
const MessagesAnswerSchema = z.object({ data: z.array(z.unknown()), meta: z.object({ hasMore: z.boolean() }) });
const SummaryAnswerSchema = z.object({ data: z.object({ summary: z.string() }) });
const ThreadSchema = z.looseObject({ title: z.string().nullish() });

const jsonOf = async <T>(result: GatewayResult<Response>, schema: z.ZodType<T>): Promise<GatewayResult<T>> => {
  if (!result.ok) return result;
  const parsed = schema.safeParse(await result.data.json().catch(() => undefined));
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: UPSTREAM_UNAVAILABLE };
};

const threadTitleOf = (connection: MastraConnection): ChatRuntimeGateway["threadTitle"] => (input) =>
  withDeadline(input.scope, connection.timeouts.jsonMs, async (signal) => {
    const client = await clientFor(connection, input.scope, signal);
    const parsed = ThreadSchema.safeParse(await client.getMemoryThread({ threadId: input.threadId, agentId: memoryAgentIdOf(input.agentId) }).get());
    return parsed.success ? (parsed.data.title ?? null) : null;
  });

/**
 * The chat routes of Mastra through the gateway (decision 0031): the caller's Bearer and scope
 * as headers, the UI message stream handed back unread, errors mapped by `mapMastraError` (a core
 * code of the envelope, e.g. the kill-switch 503 `FEATURE_DISABLED`, else the status).
 */
export const createMastraChatGateway = (options: MastraGatewayOptions): ChatRuntimeGateway => {
  const connection = connectionOf(options);
  const call = (scope: Parameters<ChatRuntimeGateway["abort"]>[0]["scope"], route: Parameters<typeof callRawRoute>[0]["call"]) => callRawRoute({ connection, scope, call: route });
  return {
    send: async ({ scope, agentId, body }) => {
      const result = await call(scope, { method: "POST", path: CHAT_ROUTES.send(agentId), body: JSON.stringify(body), contentType: "application/json", accept: SSE });
      if (!result.ok) return result;
      const stream = streamOf(result.data);
      return stream === null ? { ok: false, error: UPSTREAM_UNAVAILABLE } : { ok: true, data: stream };
    },
    observe: async ({ scope, agentId, runId }) => {
      const result = await call(scope, { method: "GET", path: CHAT_ROUTES.observe(agentId, runId), accept: SSE });
      return result.ok ? { ok: true, data: streamOf(result.data) } : result;
    },
    abort: async ({ scope, runId }) => {
      const result = await call(scope, { method: "POST", path: CHAT_ROUTES.abort(runId) });
      if (!result.ok) return result;
      await result.data.body?.cancel();
      return { ok: true, data: null };
    },
    threadTitle: threadTitleOf(connection),
    deleteThread: (input) =>
      withDeadline(input.scope, connection.timeouts.jsonMs, async (signal) => {
        const client = await clientFor(connection, input.scope, signal);
        const agentId = memoryAgentIdOf(input.agentId);
        await client.getMemoryThread({ threadId: input.threadId, agentId }).delete({ agentId });
        return null;
      }),
    listMessages: async ({ scope, agentId, page, perPage }): Promise<GatewayResult<ChatMessagesPage>> => {
      const answer = await jsonOf(await call(scope, { method: "GET", path: CHAT_ROUTES.messages(agentId, page, perPage), accept: "application/json" }), MessagesAnswerSchema);
      return answer.ok ? { ok: true, data: { messages: answer.data.data, hasMore: answer.data.meta.hasMore } } : answer;
    },
    summarize: async ({ scope, agentId }) => {
      const answer = await jsonOf(await call(scope, { method: "POST", path: CHAT_ROUTES.summary(agentId), accept: "application/json" }), SummaryAnswerSchema);
      return answer.ok ? { ok: true, data: answer.data.data } : answer;
    },
  };
};
