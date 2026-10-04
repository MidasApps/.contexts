import { FORWARDED_HEADERS, type TenantId, type UserPrincipal } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { apiError } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import type { ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { AgentCallScope } from "../../application/ports/agent-runtime-gateway.ts";
import type { VoiceRuntimeGateway } from "../../application/ports/chat-runtime-gateway.ts";

export const VOICE_USE_PERMISSION = "core.voice.use";

/** What the `/v1/voice` handlers need (built in `apps/web` `runtime-routes.ts`). */
export type VoiceRoutesDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly voice: VoiceRuntimeGateway;
  readonly resolveAccessContext: ResolveAccessContext;
  /**
   * Effective flag values of an organization (the flags context), for the availability route.
   * Absent, or failing, the route answers "off" (fail closed, decision 0034).
   */
  readonly readFlags?: ((tenantId: TenantId) => Promise<Readonly<Record<string, boolean>>>) | undefined;
};

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Authorizes `core.voice.use` at the organization and builds the gateway scope (the caller's own
 * Bearer, the organization's regional settings). No conversation: voice turns text into the prompt
 * or reads a message aloud; the chat itself goes through `/v1/chat`.
 */
export const voiceScopeOf = async (args: {
  readonly deps: VoiceRoutesDeps;
  readonly principal: UserPrincipal;
  readonly tenantId: TenantId;
  readonly authorize: Authorize;
  readonly request: Request;
  readonly requestId: string;
}): Promise<AgentCallScope | Response> => {
  const { principal, tenantId, requestId, request } = args;
  const node = { level: "organization", tenantId } as const;
  const decision = await args.authorize({ principal, permission: VOICE_USE_PERMISSION, node });
  if (!decision.allowed) return deniedResponse(decision.reason, requestId);
  const context = await args.deps.resolveAccessContext({ principal, node });
  const bearer = BEARER.exec(request.headers.get(FORWARDED_HEADERS.authorization) ?? "")?.[1];
  if (context === null || bearer === undefined) return apiError(403, "FORBIDDEN", requestId);
  const traceparent = request.headers.get(FORWARDED_HEADERS.traceparent);
  return {
    bearer,
    tenantId,
    regional: context.regional,
    requestId,
    ...(traceparent === null ? {} : { traceparent }),
    signal: request.signal,
  };
};

/** Magic bytes of the accepted recordings (decision 0034): the declared type is never trusted. */
export const sniffAudioType = (bytes: Uint8Array): "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/wav" | null => {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  return null;
};
