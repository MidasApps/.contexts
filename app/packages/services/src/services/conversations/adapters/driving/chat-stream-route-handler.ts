import { type Conversation, resumeChatStreamEndpoint, type UserPrincipal } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import { gatewayErrorResponse } from "../../../agents/adapters/driven/mastra-error-mapper.ts";
import { apiError, noContentResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { CONVERSATION_SEND_PERMISSION, conversationNode } from "../../application/use-cases/send-chat-message.ts";
import { liveActiveRunId } from "../../domain/conversation.ts";
import { chatScopeOf, type ChatRoutesDeps, chatStreamResponse, endRunOnClose } from "./chat-http.ts";

/** A conversation of the caller with its live run and gateway scope, or the refusal response. */
export type OwnedRun = { readonly conversation: Conversation; readonly runId: string | null; readonly scope: AgentCallScope };

/**
 * Owner check → authorize `permission` at the conversation's node → gateway scope. A foreign,
 * deleted or unknown conversation answers 404 (no IDOR leak).
 */
export const loadOwnedRun = async (args: {
  readonly deps: ChatRoutesDeps;
  readonly principal: UserPrincipal;
  readonly conversationId: string;
  readonly permission: string;
  readonly authorize: Authorize;
  readonly request: Request;
  readonly requestId: string;
}): Promise<OwnedRun | Response> => {
  const { deps, principal, requestId } = args;
  const found = await deps.conversations.getConversation({ conversationId: args.conversationId, ownerId: principal.uid });
  if (!found.ok) return apiError(404, "NOT_FOUND", requestId);
  const conversation = found.data;
  const decision = await args.authorize({ principal, permission: args.permission, node: conversationNode(conversation) });
  if (!decision.allowed) return deniedResponse(decision.reason, requestId);
  const scope = await chatScopeOf({ deps, principal, conversation, request: args.request, requestId });
  if (scope === null) return apiError(403, "FORBIDDEN", requestId);
  return { conversation, runId: liveActiveRunId(conversation, deps.conversations.clock.now()), scope };
};

/**
 * `GET /v1/chat/{conversationId}/stream` (spec §4.2, decision 0031): re-attaches to the active run
 * through Mastra `observe` (a full replay from `start`). 204 when no run is active, or when Mastra
 * has nothing to replay (finished, or run by another instance): then `activeRunId` is cleared and
 * the client reloads the messages from memory.
 */
export const buildChatStreamRoute = (deps: ChatRoutesDeps): Record<string, RouteHandler> => ({
  [resumeChatStreamEndpoint.id]: withApiRoute(resumeChatStreamEndpoint, deps.pipeline, async ({ principal, input, authorize, requestId, request, logger }) => {
    const owned = await loadOwnedRun({ deps, principal, conversationId: input.params.conversationId, permission: CONVERSATION_SEND_PERMISSION, authorize, request, requestId });
    if (owned instanceof Response) return owned;
    const { conversation, runId, scope } = owned;
    if (runId === null) return noContentResponse();
    const observed = await deps.chat.observe({ scope, agentId: conversation.agentId, runId });
    if (!observed.ok) return gatewayErrorResponse(observed.error, requestId);
    const end = endRunOnClose({ deps, logger, scope, conversation, runId });
    if (observed.data === null) {
      await end();
      return noContentResponse();
    }
    logger.info("chat_stream_resumed", { requestId, conversationId: conversation.id, runId });
    return chatStreamResponse(observed.data, conversation.id, end);
  }),
});
