import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal, sensitive } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

export const MAX_SPEECH_TEXT_CHARS = 4000;

/** Result of `POST /v1/voice/transcriptions` (SP4 spec §4.5). */
export const TranscriptionSchema = z.strictObject({
  text: z.string().max(20_000).meta(personal("What the member said.")),
  language: z.string().min(1).max(35).nullable().meta(none("Detected language (BCP 47), when the model reports it.")),
  durationInSeconds: z.number().nonnegative().nullable().meta(none("Audio length, when known.")),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;

export const TranscriptionContract = defineContract(TranscriptionSchema, {
  id: "voice.Transcription",
  kind: "view",
  description: "Text transcribed from a push-to-talk recording, put in the prompt for review.",
  examples: [{ text: "Summarize the onboarding guide.", language: "en", durationInSeconds: 3.2 }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
  permission: "core.voice.use",
});

/** Body of `POST /v1/voice/speech` (read aloud). */
export const SpeechRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_SPEECH_TEXT_CHARS).meta(personal("Text to read aloud.")),
  voice: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional()
    .meta(none("Provider voice id; the default voice otherwise.")),
});
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;

export const SpeechRequestContract = defineContract(SpeechRequestSchema, {
  id: "voice.SpeechRequest",
  kind: "command",
  description: "Text of an assistant message to read aloud as streamed audio.",
  examples: [{ text: "Here is the summary of the onboarding guide." }, { text: "Done.", voice: "alloy" }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
  permission: "core.voice.use",
});

/** `201` of `POST /v1/voice/realtime-sessions`: an ephemeral WebRTC client secret (≤ 60 s). */
export const RealtimeSessionSchema = z.strictObject({
  clientSecret: z.string().min(1).max(4096).meta(sensitive("Ephemeral client secret for the provider's WebRTC endpoint.")),
  expiresAt: IsoDateTimeSchema.meta(none("When the secret stops working (UTC, at most 60 s ahead).")),
  model: z.string().min(1).max(200).meta(none("Realtime model id.")),
});
export type RealtimeSession = z.infer<typeof RealtimeSessionSchema>;

export const RealtimeSessionContract = defineContract(RealtimeSessionSchema, {
  id: "voice.RealtimeSession",
  kind: "view",
  description: "A short-lived secret for an optional realtime voice session without tools.",
  examples: [{ clientSecret: "ek_example", expiresAt: "2026-09-29T14:31:00.000Z", model: "gpt-realtime-2.1" }],
  pii: "sensitive",
  tenancyScope: "user",
  relations: [],
  permission: "core.voice.use",
});
