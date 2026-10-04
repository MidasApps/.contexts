import { sendChatMessageEndpoint } from "@core/contracts";
import { gatewayErrorResponse } from "../../../agents/adapters/driven/mastra-error-mapper.ts";
import { apiError } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { makeRecordToolDecisions } from "../../application/use-cases/record-tool-decision.ts";
import { makeResolveAttachments } from "../../application/use-cases/resolve-attachments.ts";
import { makeSendChatMessage, type SendChatError } from "../../application/use-cases/send-chat-message.ts";
import { type ChatRoutesDeps, chatScopeOf, chatStreamResponse, endRunOnClose } from "./chat-http.ts";
import { buildChatStopRoute } from "./chat-stop-route-handler.ts";
import { buildChatStreamRoute } from "./chat-stream-route-handler.ts";

/** Seconds a client waits when its organization already runs 5 chat streams. */
const STREAMS_RETRY_AFTER_SECONDS = 5;

/** `/v1` response of a refused turn (errors before the stream starts use the §6 envelope). */
export const sendChatErrorResponse = (error: SendChatError, requestId: string): Response => {
  switch (error.code) {
    case "CONVERSATION_NOT_FOUND":
    case "AGENT_NOT_FOUND":
      return apiError(404, "NOT_FOUND", requestId);
    case "ACCESS_DENIED":
      return deniedResponse(error.reason, requestId);
    case "STREAMS_EXHAUSTED": {
      const response = apiError(429, "RATE_LIMITED", requestId);
      response.headers.set("retry-after", String(STREAMS_RETRY_AFTER_SECONDS));
      return response;
    }
    case "ATTACHMENTS_INVALID":
      return apiError(400, "VALIDATION_FAILED", requestId, [...error.details]);
    case "APPROVAL_INVALID":
      return apiError(400, "VALIDATION_FAILED", requestId, [{ field: "message.parts", issue: "APPROVAL_INVALID" }]);
    case "SCOPE_UNAVAILABLE":
      return apiError(403, "FORBIDDEN", requestId);
    case "GATEWAY":
      return gatewayErrorResponse(error.error, requestId);
  }
};

/**
 * `POST /v1/chat` (SP4 spec §4.1–§4.4, decisions 0031–0033): auth (user Bearer) → validate
 * (`ChatRequest`) → rate limit `chat-turn` → owner check → authorize `core.conversation.send` →
 * 5 streams per tenant → attachments or approval audit → Mastra chat route. Answers Mastra's UI
 * message stream unchanged with `x-conversation-id`; `activeRunId` is cleared when it closes.
 */
const buildSendRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(
    sendChatMessageEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request, audit, logger }) => {
      const send = makeSendChatMessage({
        conversations: deps.conversations,
        gateway: deps.chat,
        resolveAttachments: makeResolveAttachments(deps.files),
        recordToolDecisions: makeRecordToolDecisions({ audit }),
        ...(deps.isChatAgentEnabled === undefined ? {} : { isChatAgentEnabled: deps.isChatAgentEnabled }),
      });
      const scopeOf = (conversation: Parameters<typeof chatScopeOf>[0]["conversation"]) =>
        chatScopeOf({ deps, principal, conversation, request, requestId });
      const sent = await send({ principal, request: input.body, requestId, authorize, scopeOf });
      if (!sent.ok) return sendChatErrorResponse(sent.error, requestId);
      const { conversation, stream, runId, scope } = sent.data;
      logger.info("chat_turn_started", {
        requestId,
        conversationId: conversation.id,
        runId,
        role: input.body.message.role,
      });
      return chatStreamResponse(stream, conversation.id, endRunOnClose({ deps, logger, scope, conversation, runId }));
    },
  );

/** The `/v1/chat` routes: send, resume (`GET …/stream`) and stop. Path B approvals are not built (decision 0032). */
export const buildChatRoutes = (deps: ChatRoutesDeps): Record<string, RouteHandler> => ({
  [sendChatMessageEndpoint.id]: buildSendRoute(deps),
  ...buildChatStreamRoute(deps),
  ...buildChatStopRoute(deps),
});
