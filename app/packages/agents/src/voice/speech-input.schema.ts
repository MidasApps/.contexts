import { z } from "zod";

/** Longest text one speech request may synthesize (cost cap per call). */
export const MAX_SPEECH_TEXT_CHARS = 4000;

/**
 * Body of `POST /voice/speech` (server-only; SP4 adds the `/v1` contract).
 * `voice` is a provider voice id; unknown ids are the provider's 4xx.
 */
export const SpeechInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_SPEECH_TEXT_CHARS),
  voice: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
});

export type SpeechInput = z.infer<typeof SpeechInputSchema>;
