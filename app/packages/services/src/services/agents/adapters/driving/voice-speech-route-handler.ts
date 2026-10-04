import { synthesizeSpeechEndpoint } from "@core/contracts";
import { withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { gatewayErrorResponse } from "../driven/mastra-error-mapper.ts";
import { type VoiceRoutesDeps, voiceScopeOf } from "./voice-http.ts";

/**
 * `POST /v1/voice/speech?organizationId=` `{ text ≤ 4000, voice? }` (spec §4.5): reads a message
 * aloud. The audio streams back as Mastra sends it (`audio/mpeg`, `audio/wav`, ...), never cached.
 */
export const buildVoiceSpeechRoute = (deps: VoiceRoutesDeps): Record<string, RouteHandler> => ({
  [synthesizeSpeechEndpoint.id]: withApiRoute(
    synthesizeSpeechEndpoint,
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
      const { text, voice } = input.body;
      const answer = await deps.voice.synthesize({ scope, text, ...(voice === undefined ? {} : { voice }) });
      if (!answer.ok) return gatewayErrorResponse(answer.error, requestId);
      return new Response(answer.data.body, {
        status: 200,
        headers: { "content-type": answer.data.contentType, "cache-control": "no-store" },
      });
    },
  ),
});
