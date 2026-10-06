import { describe, expect, it } from "vitest";
import { evalEnvOf, evalModeOf } from "./eval-harness.ts";
import { loadMemoryDataset, runMemoryComparison } from "./memory-comparison.ts";

// SP3 Task 28. `pnpm evals` runs it with fake models to prove the harness (no quality
// claim); `pnpm -F @core/agents exec vitest run --project evals-real memory-comparison` produces the numbers
// that decide AI_MEMORY_OBSERVATIONAL, and skips without provider keys.
const mode = evalModeOf(process.env);

describe.skipIf(mode === null)("observational memory comparison", () => {
  it("runs configs A and B over memory.v1 and records score, tokens and cost", { timeout: 600_000 }, async () => {
    const dataset = loadMemoryDataset();
    const { report, reportPath } = await runMemoryComparison({
      mode: mode ?? "fake",
      env: evalEnvOf(mode ?? "fake", process.env),
      dataset,
    });
    expect(reportPath).not.toBeNull();
    expect(report.configs.map((config) => config.configId)).toEqual(["A-semantic-recall", "B-observational"]);
    for (const config of report.configs) {
      expect(config.cases).toHaveLength(dataset.cases.length);
      expect(config.meter.calls).toBeGreaterThan(0);
      expect(config.meter.inputTokens).toBeGreaterThan(0);
      // Semantic recall brings the facts of the setup conversation into the probe's prompt.
      expect(config.cases.every((result) => result.recallReachedPrompt)).toBe(true);
    }
    if (report.mode === "fake") expect(report.recommendation.enableByDefault).toBe(false);
  });
});
