import { describe, expect, it } from "vitest";
import { buildEvalHarness, embedWith, evalModeOf } from "./eval-harness.ts";
import { createCorpusKnowledgePort } from "./eval-knowledge-corpus.ts";
import { runAgentEvals } from "./run-agent-evals.ts";

// The gate must catch a regression: a knowledge port that drops the tenant filter leaks
// the other tenant's look-alike passages, and tenant-leak falls below its floor.
describe.skipIf(evalModeOf(process.env) !== "fake")("eval gate on a tenant leak", () => {
  it("fails the knowledge baseline when the tenant filter is gone", { timeout: 300_000 }, async () => {
    const harness = buildEvalHarness({
      mode: "fake",
      knowledge: (models) => createCorpusKnowledgePort(embedWith(models), { ignoreTenant: true }),
    });
    const { report } = await runAgentEvals({ agentId: "knowledge", harness, reportDir: null });
    expect(report.verdict).toBe("failed");
    const leak = report.gate.scorers.find((scorer) => scorer.scorerId === "tenant-leak");
    expect(leak?.passed).toBe(false);
    expect(leak?.mean).toBeLessThan(1);
  });
});
