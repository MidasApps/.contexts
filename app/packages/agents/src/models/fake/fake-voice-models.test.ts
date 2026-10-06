import { describe, expect, it } from "vitest";
import { buildSilentWav, createFakeSpeechModel, createFakeTranscriptionModel } from "./fake-voice-models.ts";

describe("fake voice models", () => {
  it("transcribes to a deterministic text with the audio size", async () => {
    const result = await createFakeTranscriptionModel().doGenerate({
      audio: new Uint8Array(42),
      mediaType: "audio/webm",
    });
    expect(result.text).toBe("fake transcript 42 bytes");
  });

  it("speaks a valid silent WAV", async () => {
    const { audio } = await createFakeSpeechModel().doGenerate({ text: "hello" });
    const bytes = Buffer.from(audio as Uint8Array);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    expect(bytes.readUInt32LE(4)).toBe(bytes.byteLength - 8);
    expect(bytes.subarray(44).every((byte) => byte === 0)).toBe(true);
  });

  it("sizes the WAV from duration and sample rate", () => {
    expect(buildSilentWav(1, 8000).byteLength).toBe(44 + 16_000);
  });
});
