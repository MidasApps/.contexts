import { describe, expect, it } from "vitest";
import {
  loadMemoryDataset,
  type MemoryConfigResult,
  recommendObservational,
  scoreRecall,
} from "./memory-comparison.ts";

const result = (meanScore: number, costMicroUsd: number | null): MemoryConfigResult => ({
  configId: "A-semantic-recall",
  meanScore,
  cases: [],
  meter: { calls: 1, inputTokens: 1, outputTokens: 1, costMicroUsd, callsByRole: {} },
});

describe("memory comparison", () => {
  it("loads memory.v1 with 10 generic cases", () => {
    const dataset = loadMemoryDataset();
    expect(dataset.name).toBe("memory.v1");
    expect(dataset.cases).toHaveLength(10);
    expect(dataset.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("scores the share of expected terms, case-insensitively", () => {
    expect(scoreRecall("It moved to MAY.", ["may"])).toBe(1);
    expect(scoreRecall("Reduce onboarding time.", ["onboarding", "two days"])).toBe(0.5);
    expect(scoreRecall("No idea.", ["violet"])).toBe(0);
  });

  it("never enables OM from a fake run", () => {
    expect(recommendObservational("fake", result(0, 10), result(1, 10)).enableByDefault).toBe(false);
  });

  it("enables OM only when B scores at least A at no more than 1.2x its cost", () => {
    expect(recommendObservational("real", result(0.8, 100), result(0.8, 120)).enableByDefault).toBe(true);
    expect(recommendObservational("real", result(0.8, 100), result(0.9, 121)).enableByDefault).toBe(false);
    expect(recommendObservational("real", result(0.8, 100), result(0.7, 50)).enableByDefault).toBe(false);
    expect(recommendObservational("real", result(0.8, null), result(0.9, 50)).enableByDefault).toBe(false);
  });
});
