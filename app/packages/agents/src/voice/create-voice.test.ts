import { Readable } from "node:stream";
import type { SpeechModelV4, TranscriptionModelV4 } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { buildSilentWav, createFakeSpeechModel, createFakeTranscriptionModel } from "../models/fake/fake-voice-models.ts";
import { createVoice, type VoiceModels } from "./create-voice.ts";

const fakeModels = (overrides: Partial<VoiceModels> = {}): VoiceModels => ({
  transcription: () => createFakeTranscriptionModel(),
  speech: () => createFakeSpeechModel(),
  ...overrides,
});

const readAll = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

describe("createVoice", () => {
  it("transcribes with the fake model through CompositeVoice.listen", async () => {
    const voice = createVoice({ models: fakeModels() });
    const text = await voice?.voice.listen(Readable.from([Buffer.alloc(42)]));
    expect(text).toBe("fake transcript 42 bytes");
  });

  it("speaks a WAV through CompositeVoice.speak", async () => {
    const voice = createVoice({ models: fakeModels() });
    const audio = await readAll((await voice?.voice.speak("hello")) as NodeJS.ReadableStream);
    expect(audio.toString("ascii", 0, 4)).toBe("RIFF");
  });

  it("returns the transcript with duration and language for the routes", async () => {
    const voice = createVoice({ models: fakeModels() });
    const result = await voice?.transcribe({ audio: new Uint8Array(10), mediaType: "audio/webm" });
    expect(result).toEqual({ text: "fake transcript 10 bytes", language: "en", durationInSeconds: 0 });
  });

  it("returns the audio bytes with a media type sniffed from the bytes", async () => {
    const voice = createVoice({ models: fakeModels() });
    const result = await voice?.synthesize({ text: "hello" });
    expect(result?.mediaType).toBe("audio/wav");
    expect(Buffer.from(result?.audio ?? new Uint8Array()).equals(Buffer.from(buildSilentWav()))).toBe(true);
  });

  it("is null when neither voice model is configured (feature off)", () => {
    expect(createVoice({ models: fakeModels({ transcription: () => null, speech: () => null }) })).toBeNull();
  });

  it("reports the capabilities it can serve; realtime stays off without a provider", () => {
    const onlyStt = createVoice({ models: fakeModels({ speech: () => null }) });
    expect(onlyStt?.capabilities).toEqual({ transcription: true, speech: false, realtime: false });
    expect(createVoice({ models: fakeModels() })?.capabilities).toEqual({ transcription: true, speech: true, realtime: false });
  });

  it("fails a synthesis when the speech model is missing", async () => {
    const voice = createVoice({ models: fakeModels({ speech: () => null }) });
    await expect(voice?.synthesize({ text: "hello" })).rejects.toMatchObject({ code: "FEATURE_UNAVAILABLE" });
  });

  it("builds the models once, lazily", async () => {
    let built = 0;
    const transcription = (): TranscriptionModelV4 => {
      built += 1;
      return createFakeTranscriptionModel();
    };
    const voice = createVoice({ models: { transcription, speech: (): SpeechModelV4 | null => null } });
    await voice?.transcribe({ audio: new Uint8Array(1), mediaType: "audio/wav" });
    await voice?.transcribe({ audio: new Uint8Array(1), mediaType: "audio/wav" });
    expect(built).toBe(1);
  });
});
