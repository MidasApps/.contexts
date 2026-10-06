import {
  createRealtimeSessionEndpoint,
  getVoiceAvailabilityEndpoint,
  MAX_SPEECH_TEXT_CHARS,
  type RealtimeSession,
  TranscriptionSchema,
  type VoiceAvailability,
} from "@core/contracts";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { ApiConnection } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { sendRawRequest } from "#/shared/api/raw-request.ts";

const VOICE_OFF: VoiceAvailability = { voice: false, realtime: false };
const AVAILABILITY_STALE_MS = 60_000;

/**
 * `GET /v1/voice/availability` (decision 0034): whether the organization's voice flags are on.
 * Voice stays hidden until this says so; a failure counts as off.
 */
export const voiceAvailabilityQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.organizationScoped(organizationId, "voice", "availability"),
    staleTime: AVAILABILITY_STALE_MS,
    retry: false,
    queryFn: async ({ signal }): Promise<VoiceAvailability> => {
      try {
        return (await callEndpoint(getVoiceAvailabilityEndpoint, { query: { organizationId }, signal })).data;
      } catch (error: unknown) {
        if (signal.aborted) throw error;
        return VOICE_OFF;
      }
    },
  });

const organizationQuery = (organizationId: string): string => `organizationId=${encodeURIComponent(organizationId)}`;

const TranscriptionAnswerSchema = z.object({ data: TranscriptionSchema });

/** The extension the server's form parser sees; the type itself is read from the magic bytes. */
const extensionOf = (mediaType: string): string =>
  mediaType.includes("ogg") ? "ogg" : mediaType.includes("mp4") ? "mp4" : mediaType.includes("wav") ? "wav" : "webm";

/**
 * `POST /v1/voice/transcriptions` (multipart field `audio`, ≤ 5 MB, ≤ 60 s): the text of a
 * push-to-talk recording. The recording is sent once and never kept or logged by the client.
 * @throws {ApiError} e.g. 503 `FEATURE_UNAVAILABLE` while voice is off, 400 for a refused recording.
 */
export const transcribeRecording = async (
  connection: ApiConnection,
  input: { organizationId: string; audio: Blob; signal?: AbortSignal },
): Promise<string> => {
  const form = new FormData();
  form.set("audio", input.audio, `recording.${extensionOf(input.audio.type)}`);
  const response = await sendRawRequest(connection, {
    method: "POST",
    path: `/v1/voice/transcriptions?${organizationQuery(input.organizationId)}`,
    body: form,
    accept: "application/json",
    signal: input.signal,
  });
  const parsed = TranscriptionAnswerSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success)
    throw new ApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "Response does not match the endpoint contract.",
    });
  return parsed.data.data.text.trim();
};

/**
 * `POST /v1/voice/speech` `{ text ≤ 4000 }`: the audio of a message read aloud, as a blob the
 * player loads from an object URL. Longer text is read up to the limit.
 */
export const synthesizeSpeech = async (
  connection: ApiConnection,
  input: { organizationId: string; text: string; signal?: AbortSignal },
): Promise<Blob> => {
  const response = await sendRawRequest(connection, {
    method: "POST",
    path: `/v1/voice/speech?${organizationQuery(input.organizationId)}`,
    body: JSON.stringify({ text: input.text.trim().slice(0, MAX_SPEECH_TEXT_CHARS) }),
    contentType: "application/json",
    accept: "audio/*",
    signal: input.signal,
  });
  return response.blob();
};

/** `POST /v1/voice/realtime-sessions`: an ephemeral secret (≤ 60 s, no tools); 503 unless the flag, real mode and a provider key allow it. */
export const createRealtimeSession = async (
  callEndpoint: CallEndpoint,
  organizationId: string,
  signal?: AbortSignal,
): Promise<RealtimeSession> =>
  (
    await callEndpoint(createRealtimeSessionEndpoint, {
      query: { organizationId },
      ...(signal === undefined ? {} : { signal }),
    })
  ).data;
