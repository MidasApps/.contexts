import { describe, expect, it } from "vitest";
import { BaselineSchema, baselineFor, evaluateGate, loadBaseline } from "./eval-baseline.ts";
import { EVAL_AGENT_IDS } from "./eval-dataset.ts";

const baseline = BaselineSchema.parse({
  "tool-routing": { minimum: 0.9, tolerance: 0.05 },
  "format-compliance": { minimum: 1, tolerance: 0 },
});

describe("evaluateGate", () => {
  it("passes a mean inside the tolerance band", () => {
    const gate = evaluateGate({ means: { "tool-routing": 0.86, "format-compliance": 1 }, baseline });
    expect(gate.passed).toBe(true);
    expect(gate.scorers).toEqual([
      { scorerId: "tool-routing", mean: 0.86, minimum: 0.9, tolerance: 0.05, floor: 0.85, passed: true },
      { scorerId: "format-compliance", mean: 1, minimum: 1, tolerance: 0, floor: 1, passed: true },
    ]);
  });

  it("fails a mean below minimum - tolerance", () => {
    const gate = evaluateGate({ means: { "tool-routing": 0.84, "format-compliance": 1 }, baseline });
    expect(gate.passed).toBe(false);
    expect(gate.scorers.find((scorer) => scorer.scorerId === "tool-routing")?.passed).toBe(false);
  });

  it("fails a baselined scorer that produced no score", () => {
    const gate = evaluateGate({ means: { "tool-routing": 1 }, baseline });
    expect(gate.passed).toBe(false);
    expect(gate.scorers.find((scorer) => scorer.scorerId === "format-compliance")).toMatchObject({
      mean: null,
      passed: false,
    });
  });

  it("ignores scorers without a baseline", () => {
    expect(evaluateGate({ means: { "tool-routing": 1, "format-compliance": 1, extra: 0 }, baseline }).passed).toBe(
      true,
    );
  });

  it("rounds the floor so 0.9 - 0.05 is exactly 0.85", () => {
    expect(evaluateGate({ means: { "tool-routing": 0.85, "format-compliance": 1 }, baseline }).passed).toBe(true);
  });
});

describe("baselineFor", () => {
  it("uses the real band in real mode and the main band otherwise", () => {
    const withReal = BaselineSchema.parse({
      "tool-routing": { minimum: 1, tolerance: 0, real: { minimum: 0.9, tolerance: 0.1 } },
    });
    expect(baselineFor(withReal, "fake")).toEqual({ "tool-routing": { minimum: 1, tolerance: 0 } });
    expect(baselineFor(withReal, "real")).toEqual({ "tool-routing": { minimum: 0.9, tolerance: 0.1 } });
    expect(evaluateGate({ means: { "tool-routing": 0.85 }, baseline: baselineFor(withReal, "real") }).passed).toBe(
      true,
    );
    expect(evaluateGate({ means: { "tool-routing": 0.85 }, baseline: baselineFor(withReal, "fake") }).passed).toBe(
      false,
    );
  });
});

describe("baselines", () => {
  it("refuses a tolerance above the minimum and unknown keys", () => {
    expect(BaselineSchema.safeParse({ x: { minimum: 0.1, tolerance: 0.2 } }).success).toBe(false);
    expect(BaselineSchema.safeParse({ x: { minimum: 0.9, tolerance: 0.1, extra: 1 } }).success).toBe(false);
  });

  it.each(EVAL_AGENT_IDS)("has a valid baseline for %s", (agentId) => {
    expect(Object.keys(loadBaseline(agentId)).length).toBeGreaterThan(0);
  });
});
