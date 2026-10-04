import { createRealtimeSessionEndpoint, RealtimeSessionSchema } from "@core/contracts";
import { z } from "zod";
import { apiError, dataResponse } from "#/services/shared/http/api-errors.ts";
import { withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import { gatewayErrorResponse } from "../driven/mastra-error-mapper.ts";
import { buildVoiceAvailabilityRoute } from "./voice-availability-route-handler.ts";
import { type VoiceRoutesDeps, voiceScopeOf } from "./voice-http.ts";
import { buildVoiceSpeechRoute } from "./voice-speech-route-handler.ts";
import { buildVoiceTranscriptionsRoute } from "./voice-transcriptions-route-handler.ts";

const RealtimeAnswerSchema = z.object({ data: RealtimeSessionSchema });

/**
 * `POST /v1/voice/realtime-sessions?organizationId=` (spec §4.5, decision 0034): an ephemeral
 * realtime secret (≤ 60 s, no tools). 503 `FEATURE_UNAVAILABLE` unless Mastra has the realtime
 * flag on, real mode and a provider key; the secret is never cached.
 */
export const buildRealtimeSessionRoute = (deps: VoiceRoutesDeps): Record<string, RouteHandler> => ({
  [createRealtimeSessionEndpoint.id]: withApiRoute(
    createRealtimeSessionEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request }) => {
      const scope = await voiceScopeOf({
        deps,
        principal,
        tenantId: input.query.organizationId,
        authorize,
        request,
        requestId,
      });
      if (scope instanceof Response) return scope;
      const answer = await deps.voice.createRealtimeSession({ scope });
      if (!answer.ok) return gatewayErrorResponse(answer.error, requestId);
      const parsed = RealtimeAnswerSchema.safeParse(answer.data);
      if (!parsed.success) return apiError(502, "UPSTREAM_UNAVAILABLE", requestId);
      const response = dataResponse({ data: parsed.data.data }, { status: 201 });
      response.headers.set("cache-control", "no-store");
      return response;
    },
  ),
});

/** Every `/v1/voice` route (SP4 Task 7). */
export const buildVoiceRoutes = (deps: VoiceRoutesDeps): Record<string, RouteHandler> => ({
  ...buildVoiceTranscriptionsRoute(deps),
  ...buildVoiceSpeechRoute(deps),
  ...buildRealtimeSessionRoute(deps),
  ...buildVoiceAvailabilityRoute(deps),
});
