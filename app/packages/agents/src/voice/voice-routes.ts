import { Readable } from "node:stream";
import { FORWARDED_HEADERS } from "@core/contracts";
import { type Logger, resolveRequestId } from "@core/services";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { ACCEPTED_AUDIO_TYPES, baseMediaType, wavDurationSeconds } from "./audio-format.ts";
import { type CoreVoice, VoiceUnavailableError } from "./create-voice.ts";
import { SpeechInputSchema } from "./speech-input.schema.ts";

/** Upload cap of a transcription (spec Task 26); the Mastra `bodySizeLimit` sits above it. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 60;
/** Speech bodies are small JSON (text ≤ 4000 chars); Mastra's body limit skips custom routes. */
export const MAX_SPEECH_BODY_BYTES = 64 * 1024;
/** Custom routes live outside the Mastra API prefix; SP4 reaches them through `/v1`. */
export const TRANSCRIPTION_ROUTE_PATH = "/voice/transcriptions";
export const SPEECH_ROUTE_PATH = "/voice/speech";

export type VoiceRouteDeps = { readonly voice: CoreVoice | null; readonly logger: Logger };

type ErrorCode = "FEATURE_UNAVAILABLE" | "VALIDATION_FAILED" | "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE" | "AUDIO_TOO_LONG" | "UPSTREAM_UNAVAILABLE";
type ErrorDetail = { readonly field: string; readonly issue: string };

const MESSAGES: Record<ErrorCode, string> = {
  FEATURE_UNAVAILABLE: "Voice is not available.",
  VALIDATION_FAILED: "One or more fields are invalid.",
  UNSUPPORTED_MEDIA_TYPE: "The audio format is not supported.",
  PAYLOAD_TOO_LARGE: "The request body is too large.",
  AUDIO_TOO_LONG: "The audio is longer than 60 seconds.",
  UPSTREAM_UNAVAILABLE: "The voice provider is unavailable.",
};

const STATUS: Record<ErrorCode, number> = {
  FEATURE_UNAVAILABLE: 503,
  VALIDATION_FAILED: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  AUDIO_TOO_LONG: 422,
  UPSTREAM_UNAVAILABLE: 502,
};

/** Envelope of contracts/api.md §6. */
const errorResponse = (code: ErrorCode, requestId: string, details?: readonly ErrorDetail[]): Response =>
  Response.json({ error: { code, message: MESSAGES[code], ...(details === undefined ? {} : { details }), requestId } }, { status: STATUS[code] });

const requestIdOf = (request: Request): string => resolveRequestId(request.headers.get(FORWARDED_HEADERS.requestId));

/** Reads at most `limit + 1` bytes, so an oversized body stops early (Content-Length may be absent). */
const readCapped = async (request: Request, limit: number): Promise<Uint8Array | "too-large"> => {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limit) return "too-large";
  if (request.body === null) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request.body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > limit) return "too-large";
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
};

const tooLong = (seconds: number | null | undefined): boolean => seconds !== null && seconds !== undefined && seconds > MAX_AUDIO_SECONDS;

const upstreamFailure = (deps: VoiceRouteDeps, event: string, requestId: string, error: unknown): Response => {
  if (error instanceof VoiceUnavailableError) return errorResponse("FEATURE_UNAVAILABLE", requestId);
  // Provider messages stay in the log; the client gets a stable code.
  deps.logger.error(event, { requestId, err: error });
  return errorResponse("UPSTREAM_UNAVAILABLE", requestId);
};

/**
 * `POST /voice/transcriptions`: raw audio body (webm, ogg, mp4, wav, mpeg), ≤ 5 MB and
 * ≤ 60 s. A WAV is measured from its header before the model runs; other containers
 * are measured by the duration the model reports (decoding them here would need a codec).
 */
export const handleTranscription = async (request: Request, deps: VoiceRouteDeps): Promise<Response> => {
  const requestId = requestIdOf(request);
  if (deps.voice === null || !deps.voice.capabilities.transcription) return errorResponse("FEATURE_UNAVAILABLE", requestId);
  const mediaType = baseMediaType(request.headers.get("content-type"));
  if (mediaType === undefined || !ACCEPTED_AUDIO_TYPES.has(mediaType)) return errorResponse("UNSUPPORTED_MEDIA_TYPE", requestId);
  const audio = await readCapped(request, MAX_AUDIO_BYTES);
  if (audio === "too-large") return errorResponse("PAYLOAD_TOO_LARGE", requestId);
  if (audio.byteLength === 0) return errorResponse("VALIDATION_FAILED", requestId, [{ field: "body", issue: "EMPTY_AUDIO" }]);
  if (tooLong(wavDurationSeconds(audio))) return errorResponse("AUDIO_TOO_LONG", requestId);
  const startedAt = performance.now();
  try {
    const transcript = await deps.voice.transcribe({ audio, mediaType, abortSignal: request.signal });
    if (tooLong(transcript.durationInSeconds)) return errorResponse("AUDIO_TOO_LONG", requestId);
    deps.logger.info("voice_transcribed", { requestId, audioBytes: audio.byteLength, mediaType, durationMs: Math.round(performance.now() - startedAt) });
    return Response.json({ data: transcript });
  } catch (error: unknown) {
    return upstreamFailure(deps, "voice_transcription_failed", requestId, error);
  }
};

const readJson = async (request: Request): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too-large" | "invalid" }> => {
  const body = await readCapped(request, MAX_SPEECH_BODY_BYTES);
  if (body === "too-large") return { ok: false, reason: "too-large" };
  try {
    return { ok: true, value: JSON.parse(Buffer.from(body).toString("utf8")) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
};

/** `POST /voice/speech` `{ text, voice? }`: streams the synthesized audio. */
export const handleSpeech = async (request: Request, deps: VoiceRouteDeps): Promise<Response> => {
  const requestId = requestIdOf(request);
  if (deps.voice === null || !deps.voice.capabilities.speech) return errorResponse("FEATURE_UNAVAILABLE", requestId);
  const body = await readJson(request);
  if (!body.ok) {
    return body.reason === "too-large"
      ? errorResponse("PAYLOAD_TOO_LARGE", requestId)
      : errorResponse("VALIDATION_FAILED", requestId, [{ field: "body", issue: "INVALID_JSON" }]);
  }
  const parsed = SpeechInputSchema.safeParse(body.value);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() }));
    return errorResponse("VALIDATION_FAILED", requestId, details);
  }
  const startedAt = performance.now();
  try {
    const { text, voice } = parsed.data;
    const { audio, mediaType } = await deps.voice.synthesize({ text, ...(voice === undefined ? {} : { voice }), abortSignal: request.signal });
    deps.logger.info("voice_synthesized", { requestId, textChars: parsed.data.text.length, audioBytes: audio.byteLength, durationMs: Math.round(performance.now() - startedAt) });
    const stream = Readable.toWeb(Readable.from([Buffer.from(audio)])) as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 200, headers: { "content-type": mediaType, "cache-control": "no-store" } });
  } catch (error: unknown) {
    return upstreamFailure(deps, "voice_synthesis_failed", requestId, error);
  }
};

/**
 * Both voice routes, authenticated by the runtime's auth provider (`requiresAuth`:
 * a verified member with `core.chat.use`). Hono hands the raw `Request` to the handlers.
 */
export const createVoiceRoutes = (deps: VoiceRouteDeps): ApiRoute[] => [
  registerApiRoute(TRANSCRIPTION_ROUTE_PATH, { method: "POST", requiresAuth: true, handler: (context) => handleTranscription(context.req.raw, deps) }),
  registerApiRoute(SPEECH_ROUTE_PATH, { method: "POST", requiresAuth: true, handler: (context) => handleSpeech(context.req.raw, deps) }),
];
