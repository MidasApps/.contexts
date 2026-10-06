import { stopChatRunEndpoint } from "@core/contracts";
import { gatewayErrorResponse } from "#/services/agents/adapters/driven/mastra-error-mapper.ts";
import { noContentResponse } from "#/services/shared/http/api-errors.ts";
import { withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import { CONVERSATION_SEND_PERMISSION } from "../../application/use-cases/send-chat-message.ts";
import { type ChatRoutesDeps, endRunOnClose } from "./chat-http.ts";
import { loadOwnedRun } from "./chat-stream-route-handler.ts";

/**
 * `POST /v1/chat/{conversationId}/stop` (spec §4.2, decision 0031): `useChat` `stop()` only
 * closes the connection, so this asks Mastra to abort the active run (remote abort request; the
 * partial answer stays in memory) and clears `activeRunId`. 204 also when nothing is running.
 */
export const buildChatStopRoute = (deps: ChatRoutesDeps): Record<string, RouteHandler> => ({
  [stopChatRunEndpoint.id]: withApiRoute(
    stopChatRunEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request, logger }) => {
      const owned = await loadOwnedRun({
        deps,
        principal,
        conversationId: input.params.conversationId,
        permission: CONVERSATION_SEND_PERMISSION,
        authorize,
        request,
        requestId,
      });
      if (owned instanceof Response) return owned;
      const { conversation, runId, scope } = owned;
      if (runId === null) return noContentResponse();
      const aborted = await deps.chat.abort({ scope, runId });
      if (!aborted.ok) return gatewayErrorResponse(aborted.error, requestId);
      await endRunOnClose({ deps, logger, scope, conversation, runId })();
      logger.info("chat_run_stopped", { requestId, conversationId: conversation.id, runId });
      return noContentResponse();
    },
  ),
});
