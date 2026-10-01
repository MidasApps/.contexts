import type { GatewayError } from "../../application/ports/agent-runtime-gateway.ts";
import type { VoiceRuntimeGateway } from "../../application/ports/chat-runtime-gateway.ts";
import { connectionOf, type MastraGatewayOptions } from "./mastra-gateway.ts";
import { callRawRoute } from "./mastra-request.ts";

/** Paths of the Mastra voice routes (`@core/agents` `voice-routes.ts`). */
export const VOICE_ROUTES = { transcriptions: "/voice/transcriptions", speech: "/voice/speech", realtimeSessions: "/voice/realtime-sessions" } as const;

/**
 * Voice statuses Mastra answers itself (decision 0034): 503 is the feature gate (voice off for the
 * platform, not configured, or the budget check unavailable), 413/415/422 an audio the route refused.
 */
export const mapVoiceStatus = (status: number): GatewayError | undefined => {
  if (status === 503) return { code: "FEATURE_UNAVAILABLE", status: 503 };
  if (status === 413 || status === 415 || status === 422) return { code: "VALIDATION_FAILED", status: 400 };
  return undefined;
};

/** The voice routes of Mastra through the gateway: caller's Bearer and scope; errors keep a core code of the envelope (`FEATURE_DISABLED`), else go by `mapVoiceStatus`. */
export const createMastraVoiceGateway = (options: MastraGatewayOptions): VoiceRuntimeGateway => {
  const connection = connectionOf(options);
  return {
    transcribe: async ({ scope, audio, mediaType }) => {
      const call = { method: "POST", path: VOICE_ROUTES.transcriptions, body: audio, contentType: mediaType, accept: "application/json", mapStatus: mapVoiceStatus } as const;
      const result = await callRawRoute({ connection, scope, call });
      return result.ok ? { ok: true, data: await result.data.json().catch(() => undefined) } : result;
    },
    synthesize: async ({ scope, text, voice }) => {
      const body = JSON.stringify({ text, ...(voice === undefined ? {} : { voice }) });
      const call = { method: "POST", path: VOICE_ROUTES.speech, body, contentType: "application/json", mapStatus: mapVoiceStatus } as const;
      const result = await callRawRoute({ connection, scope, call });
      if (!result.ok) return result;
      const stream = result.data.body;
      if (stream === null) return { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } };
      return { ok: true, data: { body: stream, contentType: result.data.headers.get("content-type") ?? "application/octet-stream" } };
    },
    createRealtimeSession: async ({ scope }) => {
      const call = { method: "POST", path: VOICE_ROUTES.realtimeSessions, accept: "application/json", mapStatus: mapVoiceStatus } as const;
      const result = await callRawRoute({ connection, scope, call });
      return result.ok ? { ok: true, data: await result.data.json().catch(() => undefined) } : result;
    },
  };
};
