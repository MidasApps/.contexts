// Voice `/v1` descriptors (SP4 spec §4.5, decision 0034). Every route answers 503
// FEATURE_UNAVAILABLE while voice is off for the platform (compliance gate) or not configured;
// audio that is too large, of another type or longer than 60 s answers 400 VALIDATION_FAILED;
// an organization over its monthly AI budget gets 429 BUDGET_EXCEEDED before any provider call.
import { z } from "zod";
import { none, personal } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { RealtimeSessionSchema, SpeechRequestSchema, TranscriptionSchema, VoiceAvailabilitySchema } from "./voice.schema.ts";

const organizationQuery = z.object({ organizationId: OrganizationIdSchema.meta(none("Organization the call is billed to.")) });

/** `200` of the speech route: raw audio bytes (`audio/mpeg`, `audio/wav`, ...). */
export const SpeechAudioSchema = z.string().meta(personal("Synthesized audio bytes (binary)."));

/**
 * The upload is `multipart/form-data` with one `audio` part (webm, ogg, mp4, wav; ≤ 5 MB,
 * ≤ 60 s), the one binary exception of `api.md` §4. No `body` is declared: the handler reads
 * the form itself after a size check.
 */
export const transcribeVoiceEndpoint = defineEndpoint({
  id: "voice.transcribe",
  method: "POST",
  path: "/v1/voice/transcriptions",
  auth: "user",
  query: organizationQuery,
  responses: { 200: dataEnvelope(TranscriptionSchema) },
  errors: { 403: ["FORBIDDEN"], 429: ["BUDGET_EXCEEDED"] },
  rateLimit: "voice-call",
  summary: "Transcribes a push-to-talk recording (multipart field audio, ≤ 5 MB, ≤ 60 s) (core.voice.use).",
});

export const synthesizeSpeechEndpoint = defineEndpoint({
  id: "voice.synthesize",
  method: "POST",
  path: "/v1/voice/speech",
  auth: "user",
  query: organizationQuery,
  body: SpeechRequestSchema,
  responses: { 200: SpeechAudioSchema },
  errors: { 403: ["FORBIDDEN"], 429: ["BUDGET_EXCEEDED"] },
  rateLimit: "voice-call",
  summary: "Reads text aloud and streams the audio (core.voice.use).",
});

export const createRealtimeSessionEndpoint = defineEndpoint({
  id: "voice.createRealtimeSession",
  method: "POST",
  path: "/v1/voice/realtime-sessions",
  auth: "user",
  query: organizationQuery,
  responses: { 201: dataEnvelope(RealtimeSessionSchema) },
  errors: { 403: ["FORBIDDEN"], 429: ["BUDGET_EXCEEDED"] },
  rateLimit: "voice-call",
  summary: "Mints an ephemeral realtime voice secret without tools; 503 while the experimental flag is off (core.voice.use).",
});

/** The chat reads this before it shows any voice control: voice stays hidden unless the flag is on. */
export const getVoiceAvailabilityEndpoint = defineEndpoint({
  id: "voice.getAvailability",
  method: "GET",
  path: "/v1/voice/availability",
  auth: "user",
  query: organizationQuery,
  responses: { 200: dataEnvelope(VoiceAvailabilitySchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Tells whether voice and realtime voice are on for the organization; never answers 503 (core.voice.use).",
});

export const VOICE_ENDPOINTS: readonly EndpointDefinition[] = [transcribeVoiceEndpoint, synthesizeSpeechEndpoint, createRealtimeSessionEndpoint, getVoiceAvailabilityEndpoint];
