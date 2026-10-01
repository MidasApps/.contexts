import { getVoiceAvailabilityEndpoint, type TenantId, type VoiceAvailability } from "@core/contracts";
import { dataResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { processLogger } from "../../../shared/observability/process-logger.ts";
import { VOICE_USE_PERMISSION, type VoiceRoutesDeps } from "./voice-http.ts";

/** Flag keys of the voice gate (flags registry, decision 0039). */
export const VOICE_FLAG_KEY = "chat.voice";
export const VOICE_REALTIME_FLAG_KEY = "chat.voice.realtime";

const OFF: VoiceAvailability = { voice: false, realtime: false };

const readAvailability = async (deps: VoiceRoutesDeps, tenantId: TenantId, requestId: string): Promise<VoiceAvailability> => {
  if (deps.readFlags === undefined) return OFF;
  try {
    const flags = await deps.readFlags(tenantId);
    const voice = flags[VOICE_FLAG_KEY] === true;
    // Realtime is voice plus its own flag, as the runtime checks it.
    return { voice, realtime: voice && flags[VOICE_REALTIME_FLAG_KEY] === true };
  } catch (error: unknown) {
    // A flag store failure keeps voice off (fail closed), as in the runtime.
    processLogger.warn("voice_availability_flags_failed", { requestId, tenantId, err: error });
    return OFF;
  }
};

/**
 * `GET /v1/voice/availability?organizationId=` (decision 0034): whether the organization's voice
 * flags are on, for a member who may use voice. The chat shows push-to-talk and read aloud only
 * when it says so; the voice routes check the same flags again on every call.
 */
export const buildVoiceAvailabilityRoute = (deps: VoiceRoutesDeps): Record<string, RouteHandler> => ({
  [getVoiceAvailabilityEndpoint.id]: withApiRoute(getVoiceAvailabilityEndpoint, deps.pipeline, async ({ principal, input, authorize, requestId }) => {
    const tenantId = input.query.organizationId;
    const decision = await authorize({ principal, permission: VOICE_USE_PERMISSION, node: { level: "organization", tenantId } });
    if (!decision.allowed) return deniedResponse(decision.reason, requestId);
    const response = dataResponse({ data: await readAvailability(deps, tenantId, requestId) });
    response.headers.set("cache-control", "no-store");
    return response;
  }),
});
