import { describe, expect, it } from "vitest";
import { createHarnessPromptEvalRunner } from "./prompt-eval-runner.ts";

// Fake mode: the whole `data` eval set runs on the harness with a candidate prompt injected.
describe("createHarnessPromptEvalRunner (decision 0038)", () => {
  it("gates a candidate on the agent's eval set and refuses agents without one", async () => {
    const runner = createHarnessPromptEvalRunner({ mode: "fake" });
    const outcome = await runner({ agentId: "data", platform: { versionId: "v1", body: "Candidate data instructions." }, addendum: null });
    expect(outcome).toMatchObject({ verdict: "passed" });
    expect(outcome === "NO_DATASET" ? [] : outcome.scorers.length).toBeGreaterThan(0);
    expect(await runner({ agentId: "web", platform: null, addendum: null })).toBe("NO_DATASET");
  }, 120_000);
});
