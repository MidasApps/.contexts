import type { SpeechModelV4, TranscriptionModelV4 } from "@ai-sdk/provider";
import { deferred } from "./deferred.ts";

const FIXED_TIMESTAMP = new Date(0);
const SAMPLE_RATE = 16_000;
const SILENCE_SECONDS = 0.1;

const audioLength = (audio: Uint8Array | string): number =>
  typeof audio === "string" ? Buffer.byteLength(audio, "base64") : audio.byteLength;

/** Transcription fake: `"fake transcript <n> bytes"` (spec §5.3). */
export const createFakeTranscriptionModel = (): TranscriptionModelV4 => ({
  specificationVersion: "v4",
  provider: "fake",
  modelId: "fake-transcription",
  doGenerate: ({ audio }) =>
    deferred(() => {
      const text = `fake transcript ${audioLength(audio)} bytes`;
      return {
        text,
        segments: [{ text, startSecond: 0, endSecond: 0 }],
        language: "en",
        durationInSeconds: 0,
        warnings: [],
        response: { timestamp: FIXED_TIMESTAMP, modelId: "fake-transcription" },
      };
    }),
});

/** A valid mono 16-bit PCM WAV of silence. */
export const buildSilentWav = (seconds = SILENCE_SECONDS, sampleRate = SAMPLE_RATE): Uint8Array => {
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  return new Uint8Array(buffer);
};

/** Speech fake: a short silent WAV whatever the text. */
export const createFakeSpeechModel = (): SpeechModelV4 => ({
  specificationVersion: "v4",
  provider: "fake",
  modelId: "fake-speech",
  doGenerate: () =>
    deferred(() => ({
      audio: buildSilentWav(),
      warnings: [],
      response: { timestamp: FIXED_TIMESTAMP, modelId: "fake-speech" },
    })),
});
