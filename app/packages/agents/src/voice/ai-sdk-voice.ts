import { PassThrough } from "node:stream";
import type { SpeechModelV4, TranscriptionModelV4 } from "@ai-sdk/provider";
import { MastraVoice } from "@mastra/core/voice";
import { generateSpeech, transcribe } from "ai";
import { sniffAudioMediaType } from "./audio-format.ts";

/**
 * AI SDK 7 (`v4` spec) voice models as Mastra voice providers. `CompositeVoice`
 * wraps only `v2`/`v3` models itself (@mastra/core 1.71), so a `v4` model passed
 * directly would be treated as a provider without `listen`/`speak`.
 */

export type Transcript = {
  readonly text: string;
  readonly language: string | null;
  readonly durationInSeconds: number | null;
};
export type SynthesizedAudio = { readonly audio: Uint8Array; readonly mediaType: string };
type CallOptions = { readonly abortSignal?: AbortSignal };

export const transcribeAudio = async (
  model: TranscriptionModelV4,
  input: { readonly audio: Uint8Array } & CallOptions,
): Promise<Transcript> => {
  const result = await transcribe({
    model,
    audio: input.audio,
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
  });
  return { text: result.text, language: result.language ?? null, durationInSeconds: result.durationInSeconds ?? null };
};

export const synthesizeSpeech = async (
  model: SpeechModelV4,
  input: { readonly text: string; readonly voice?: string } & CallOptions,
): Promise<SynthesizedAudio> => {
  const result = await generateSpeech({
    model,
    text: input.text,
    ...(input.voice === undefined ? {} : { voice: input.voice }),
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
  });
  const audio = result.audio.uint8Array;
  return { audio, mediaType: sniffAudioMediaType(audio) ?? result.audio.mediaType };
};

const readStream = async (input: unknown): Promise<Uint8Array> => {
  if (input instanceof Uint8Array) return input;
  if (typeof input === "string") return new Uint8Array(Buffer.from(input, "base64"));
  const chunks: Buffer[] = [];
  for await (const chunk of input as AsyncIterable<unknown>)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  return new Uint8Array(Buffer.concat(chunks));
};

const unsupported = (what: string): Promise<never> =>
  Promise.reject(new Error(`${what} is not supported by this voice provider`));

/** Speech-to-text provider (Mastra requires a class). */
export class AiSdkTranscriptionVoice extends MastraVoice {
  readonly #model: TranscriptionModelV4;

  constructor(model: TranscriptionModelV4) {
    super({ name: "core-transcription" });
    this.#model = model;
  }

  async listen(audioStream: unknown, options?: CallOptions): Promise<string> {
    const audio = await readStream(audioStream);
    return (
      await transcribeAudio(this.#model, {
        audio,
        ...(options?.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
      })
    ).text;
  }

  speak(): Promise<never> {
    return unsupported("speak");
  }

  override getSpeakers(): Promise<{ voiceId: string }[]> {
    return Promise.resolve([]);
  }

  override getListener(): Promise<{ enabled: boolean }> {
    return Promise.resolve({ enabled: true });
  }
}

/** Text-to-speech provider (Mastra requires a class). */
export class AiSdkSpeechVoice extends MastraVoice {
  readonly #model: SpeechModelV4;

  constructor(model: SpeechModelV4) {
    super({ name: "core-speech" });
    this.#model = model;
  }

  async speak(
    input: string | NodeJS.ReadableStream,
    options?: { speaker?: string } & CallOptions,
  ): Promise<NodeJS.ReadableStream> {
    const text = typeof input === "string" ? input : Buffer.from(await readStream(input)).toString("utf8");
    const { audio } = await synthesizeSpeech(this.#model, {
      text,
      ...(options?.speaker === undefined ? {} : { voice: options.speaker }),
      ...(options?.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    });
    const stream = new PassThrough();
    stream.end(Buffer.from(audio));
    return stream;
  }

  listen(): Promise<never> {
    return unsupported("listen");
  }

  override getSpeakers(): Promise<{ voiceId: string }[]> {
    return Promise.resolve([]);
  }
}
