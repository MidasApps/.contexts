import { describe, expect, it } from "vitest";
import { MAX_SPEECH_TEXT_CHARS, RealtimeSessionContract, SpeechRequestContract, SpeechRequestSchema, TranscriptionContract, VoiceAvailabilityContract } from "./voice.schema.ts";

const contracts = [TranscriptionContract, SpeechRequestContract, RealtimeSessionContract, VoiceAvailabilityContract];

describe("voice contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: examples parse and unknown keys are rejected", (_id, contract) => {
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });

  it("caps the speech text and rejects blank text", () => {
    expect(SpeechRequestSchema.safeParse({ text: "a".repeat(MAX_SPEECH_TEXT_CHARS + 1) }).success).toBe(false);
    expect(SpeechRequestSchema.safeParse({ text: "  " }).success).toBe(false);
  });

  it("rejects a voice id with separators", () => {
    expect(SpeechRequestSchema.safeParse({ text: "hi", voice: "../x" }).success).toBe(false);
  });
});
