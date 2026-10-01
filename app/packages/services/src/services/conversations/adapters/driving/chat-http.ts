import { type Conversation, FORWARDED_HEADERS, type UserPrincipal } from "@core/contracts";
import type { ChatStreamAnswer, ChatRuntimeGateway } from "../../../agents/application/ports/chat-runtime-gateway.ts";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { GetReadyFile, ReadFileBytes } from "../../../files/application/use-cases/read-file-bytes.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import type { ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { Logger } from "../../../shared/observability/logger.ts";
import { conversationNode, type SendChatDeps } from "../../application/use-cases/send-chat-message.ts";
import type { ConversationsServices } from "../../composition.ts";
import { trackRunStream } from "./run-stream.ts";

/** What the `/v1/chat` and `/v1/conversations` handlers need (built in `apps/web` `runtime-routes.ts`). */
export type ChatRoutesDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly chat: ChatRuntimeGateway;
  readonly conversations: ConversationsServices;
  readonly resolveAccessContext: ResolveAccessContext;
  readonly files: { readonly getReadyFile: GetReadyFile; readonly readFileBytes: ReadFileBytes };
  /** Custom agents members may chat with (decision 0046); absent: only the assistant answers. */
  readonly isChatAgentEnabled?: SendChatDeps["isChatAgentEnabled"];
  /** Pause between two title reads; tests pass one that does not sleep. */
  readonly wait?: ((ms: number) => Promise<void>) | undefined;
};

const BEARER = /^Bearer\s+(\S+)$/i;
/** The title copy after a run must not hold the end of the stream for long. */
const TITLE_TIMEOUT_MS = 3000;
/**
 * Mastra writes the generated title a moment after it closes the stream of the first turn
 * (measured: about 400 ms with the fake models). An untitled conversation asks again for a short
 * while, so the first turn names it instead of the second; later turns ask once.
 */
const TITLE_ATTEMPTS = 6;
const TITLE_RETRY_MS = 250;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const SSE = "text/event-stream";

/**
 * The gateway scope of a conversation's call: the caller's own Bearer, the regional settings of
 * the conversation's node, and the conversation as memory thread. No abort signal: a client that
 * leaves must not end the run (decision 0031); stop is its own endpoint.
 */
export const chatScopeOf = async (args: {
  readonly deps: Pick<ChatRoutesDeps, "resolveAccessContext">;
  readonly principal: UserPrincipal;
  readonly conversation: Conversation;
  readonly request: Request;
  readonly requestId: string;
}): Promise<AgentCallScope | null> => {
  const { conversation, request } = args;
  const context = await args.deps.resolveAccessContext({ principal: args.principal, node: conversationNode(conversation) });
  const bearer = BEARER.exec(request.headers.get(FORWARDED_HEADERS.authorization) ?? "")?.[1];
  if (context === null || bearer === undefined) return null;
  const traceparent = request.headers.get(FORWARDED_HEADERS.traceparent);
  return {
    bearer,
    tenantId: conversation.tenantId,
    ...(conversation.projectId === null ? {} : { projectId: conversation.projectId }),
    regional: context.regional,
    requestId: args.requestId,
    conversationId: conversation.id,
    ...(traceparent === null ? {} : { traceparent }),
  };
};

/**
 * Ends the run when its upstream stream closed: copies the thread title Mastra generated (best
 * effort, bounded) and clears `activeRunId`. Failures are logged, never thrown into the stream.
 */
export const endRunOnClose = (args: {
  readonly deps: Pick<ChatRoutesDeps, "chat" | "conversations" | "wait">;
  readonly logger: Logger;
  readonly scope: AgentCallScope;
  readonly conversation: Conversation;
  readonly runId: string;
}) => async (): Promise<void> => {
  const { deps, conversation, runId, logger } = args;
  try {
    const title = conversation.titleSource === "auto" ? await titleOf(args) : undefined;
    await deps.conversations.activeRuns.end({ conversationId: conversation.id, runId, ...(title === undefined ? {} : { title }) });
    logger.info("chat_run_ended", { requestId: args.scope.requestId, conversationId: conversation.id, runId });
  } catch (error: unknown) {
    logger.error("chat_run_end_failed", { requestId: args.scope.requestId, conversationId: conversation.id, runId, err: error });
  }
};

const titleOf = async (args: { readonly deps: Pick<ChatRoutesDeps, "chat" | "wait">; readonly scope: AgentCallScope; readonly conversation: Conversation }): Promise<string | undefined> => {
  const signal = AbortSignal.timeout(TITLE_TIMEOUT_MS);
  const attempts = args.conversation.title === null ? TITLE_ATTEMPTS : 1;
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const answer = await args.deps.chat.threadTitle({ scope: { ...args.scope, signal }, agentId: args.conversation.agentId, threadId: args.conversation.id });
      if (!answer.ok) return undefined;
      if (answer.data !== null && answer.data.trim() !== "") return answer.data;
      if (attempt < attempts) await (args.deps.wait ?? sleep)(TITLE_RETRY_MS);
    }
    // Not written in the wait: the title arrives with the next turn.
    return undefined;
  } catch {
    // Timed out: the title arrives with the next turn.
    return undefined;
  }
};

/** The UI message stream response: Mastra's bytes unchanged, `useChat` headers and the conversation id. */
export const chatStreamResponse = (stream: ChatStreamAnswer, conversationId: string, onUpstreamEnd: () => Promise<void>): Response =>
  new Response(trackRunStream(stream.body, onUpstreamEnd), {
    status: 200,
    headers: {
      "content-type": stream.contentType.startsWith(SSE) ? stream.contentType : SSE,
      "x-vercel-ai-ui-message-stream": stream.streamProtocol ?? "v1",
      [FORWARDED_HEADERS.conversationId]: conversationId,
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
