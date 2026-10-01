import { recordMessageFeedbackEndpoint } from "@core/contracts";
import type { ObservabilityServices } from "../../../observability/composition.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";

/**
 * `POST /v1/conversations/{id}/feedback` (SP5 spec §8): auth (users) → validate → the owner's
 * conversation and `core.conversation.send` at its organization → one rating per message and user.
 */
export const buildFeedbackRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  [recordMessageFeedbackEndpoint.id]: withApiRoute(recordMessageFeedbackEndpoint, deps.pipeline, async (ctx) => {
    const result = await deps.observability.recordFeedback({
      actor: ctx.principal,
      authorize: ctx.authorize,
      conversationId: ctx.input.params.conversationId,
      input: ctx.input.body,
      requestId: ctx.requestId,
    });
    if (result.ok) return dataResponse({ data: result.data });
    return result.error.code === "NOT_FOUND" ? apiError(404, "NOT_FOUND", ctx.requestId) : deniedResponse(result.error.reason, ctx.requestId);
  }),
});
