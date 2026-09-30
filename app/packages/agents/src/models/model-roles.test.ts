import { describe, expect, it } from "vitest";
import { MODEL_ROLES, parseModelId } from "./model-roles.ts";

describe("MODEL_ROLES", () => {
  it("maps every role to its AI_MODEL_<ROLE> variable", () => {
    for (const [role, spec] of Object.entries(MODEL_ROLES)) {
      expect(spec.envKey).toBe(`AI_MODEL_${role.toUpperCase()}`);
    }
  });

  it("marks only the voice roles as optional at boot", () => {
    const voiceRoles = Object.entries(MODEL_ROLES)
      .filter(([, spec]) => spec.modality === "voice")
      .map(([role]) => role);

    expect(voiceRoles).toEqual(["transcription", "speech", "realtime"]);
  });
});

describe("parseModelId", () => {
  it("splits the provider prefix from the model name", () => {
    expect(parseModelId("google/gemini-embedding-001")).toEqual({ provider: "google", model: "gemini-embedding-001" });
    expect(parseModelId("openai/gpt-realtime-2.1")).toEqual({ provider: "openai", model: "gpt-realtime-2.1" });
  });
});
