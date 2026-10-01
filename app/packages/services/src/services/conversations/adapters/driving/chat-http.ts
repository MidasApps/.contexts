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
};

const BEARER = /^Bearer\s+(\S+)$/i;
/** The title copy after a run must not hold the end of the stream for long. */
const TITLE_TIMEOUT_MS = 3000;
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
  readonly deps: Pick<ChatRoutesDeps, "chat" | "conversations">;
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

const titleOf = async (args: { readonly deps: Pick<ChatRoutesDeps, "chat">; readonly scope: AgentCallScope; readonly conversation: Conversation }): Promise<string | undefined> => {
  try {
    const answer = await args.deps.chat.threadTitle({
      scope: { ...args.scope, signal: AbortSignal.timeout(TITLE_TIMEOUT_MS) },
      agentId: args.conversation.agentId,
      threadId: args.conversation.id,
    });
    return answer.ok && answer.data !== null ? answer.data : undefined;
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
