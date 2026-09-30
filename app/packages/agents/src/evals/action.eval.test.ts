import { describe, expect, it } from "vitest";
import { buildEvalHarness, evalModeOf } from "./eval-harness.ts";
import { runAgentEvals } from "./run-agent-evals.ts";

// `pnpm evals` (AI_MODE=fake, CI gate) and `pnpm evals:real` (skips without provider keys).
const mode = evalModeOf(process.env);

describe.skipIf(mode === null)("action agent evals", () => {
  it("meets the baseline of action.v1", { timeout: 300_000 }, async () => {
    const harness = buildEvalHarness({ mode: mode ?? "fake", processEnv: process.env });
    const { report } = await runAgentEvals({ agentId: "action", harness, gitSha: process.env["GITHUB_SHA"] ?? null });
    expect(report.gate.scorers.filter((scorer) => !scorer.passed)).toEqual([]);
    expect(report.verdict).toBe("passed");
  });
});
