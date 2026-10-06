import { describe, expect, it } from "vitest";
import { loadInstructions } from "./load-instructions.ts";
import { createPromptSeedReader } from "./prompt-seed.ts";

describe("createPromptSeedReader (follow-up 86)", () => {
  it("reads the code seed of an agent with a versioned prompt", () => {
    const read = createPromptSeedReader();
    expect(read("knowledge")).toEqual({ agentId: "knowledge", body: loadInstructions("knowledge.v1") });
    expect(read("assistant")?.body.length).toBeGreaterThan(0);
  });

  it("answers null for any other id, never a path", () => {
    const read = createPromptSeedReader();
    expect(read("custom")).toBeNull();
    expect(read("../knowledge")).toBeNull();
    expect(read("")).toBeNull();
  });
});
