import { transcribeVoiceEndpoint, TranscriptionSchema } from "@core/contracts";
import { z } from "zod";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { gatewayErrorResponse } from "../driven/mastra-error-mapper.ts";
import { sniffAudioType, type VoiceRoutesDeps, voiceScopeOf } from "./voice-http.ts";

/** Recording cap (spec §4.5: 60 s, 5 MB), plus room for the multipart framing. */
export const MAX_AUDIO_UPLOAD_BYTES = 5 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const AUDIO_FIELD = "audio";

const TranscriptionAnswerSchema = z.object({ data: TranscriptionSchema });

type Upload = { readonly ok: true; readonly audio: Uint8Array<ArrayBuffer>; readonly mediaType: string } | { readonly ok: false; readonly issue: string };

// The declared length is checked before the form is parsed, so an oversized upload is never buffered.
const readUpload = async (request: Request): Promise<Upload> => {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) return { ok: false, issue: "MULTIPART_REQUIRED" };
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (!Number.isFinite(declared) || declared > MAX_AUDIO_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) return { ok: false, issue: "TOO_LARGE" };
  const form = await request.formData().catch(() => null);
  const file = form?.get(AUDIO_FIELD);
  if (file === null || file === undefined || typeof file === "string") return { ok: false, issue: "REQUIRED" };
  if (file.size === 0) return { ok: false, issue: "EMPTY_AUDIO" };
  if (file.size > MAX_AUDIO_UPLOAD_BYTES) return { ok: false, issue: "TOO_LARGE" };
  const audio = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffAudioType(audio);
  return mediaType === null ? { ok: false, issue: "TYPE_NOT_ALLOWED" } : { ok: true, audio, mediaType };
};

/**
 * `POST /v1/voice/transcriptions?organizationId=` (spec §4.5, decision 0034): multipart field
 * `audio` (webm, ogg, mp4 or wav by magic bytes, ≤ 5 MB) → authorize `core.voice.use` → Mastra
 * `/voice/transcriptions`, which gates the feature (503 while off), checks the tenant budget and
 * records the call in the usage ledger and the audit trail. Rate limit `voice-call`.
 */
export const buildVoiceTranscriptionsRoute = (deps: VoiceRoutesDeps): Record<string, RouteHandler> => ({
  [transcribeVoiceEndpoint.id]: withApiRoute(transcribeVoiceEndpoint, deps.pipeline, async ({ principal, input, authorize, requestId, request }) => {
    const scope = await voiceScopeOf({ deps, principal, tenantId: input.query.organizationId, authorize, request, requestId });
    if (scope instanceof Response) return scope;
    const upload = await readUpload(request);
    if (!upload.ok) return apiError(400, "VALIDATION_FAILED", requestId, [{ field: AUDIO_FIELD, issue: upload.issue }]);
    const answer = await deps.voice.transcribe({ scope, audio: upload.audio, mediaType: upload.mediaType });
    if (!answer.ok) return gatewayErrorResponse(answer.error, requestId);
    const parsed = TranscriptionAnswerSchema.safeParse(answer.data);
    return parsed.success ? dataResponse({ data: parsed.data.data }) : apiError(502, "UPSTREAM_UNAVAILABLE", requestId);
  }),
});
