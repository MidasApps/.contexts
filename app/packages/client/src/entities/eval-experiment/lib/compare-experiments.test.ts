import type { EvalExperimentSummary } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { compareExperiments } from "./compare-experiments.ts";

const experiment = (scores: EvalExperimentSummary["scores"]): EvalExperimentSummary => ({
  experimentId: "e",
  datasetId: "d",
  agentId: "assistant",
  promptVersionId: null,
  status: "completed",
  itemCount: 1,
  scores,
  verdict: "passed",
  startedAt: "2026-09-30T12:00:00.000Z",
  finishedAt: null,
});

describe("compareExperiments", () => {
  it("says per scorer whether B is better, worse or the same as A", () => {
    const a = experiment([
      { scorer: "tool-routing", mean: 0.9, baseline: 0.8 },
      { scorer: "tenant-leak", mean: 1, baseline: 1 },
      { scorer: "format", mean: 0.7, baseline: null },
    ]);
    const b = experiment([
      { scorer: "tool-routing", mean: 0.95, baseline: 0.85 },
      { scorer: "tenant-leak", mean: 1, baseline: 1 },
      { scorer: "format", mean: 0.5, baseline: null },
    ]);
    expect(compareExperiments(a, b)).toEqual([
      { scorer: "tool-routing", a: 0.9, b: 0.95, baseline: 0.85, outcome: "better" },
      { scorer: "tenant-leak", a: 1, b: 1, baseline: 1, outcome: "same" },
      { scorer: "format", a: 0.7, b: 0.5, baseline: null, outcome: "worse" },
    ]);
  });

  it("keeps scorers only one experiment ran", () => {
    const rows = compareExperiments(
      experiment([{ scorer: "x", mean: 0.5, baseline: 0.4 }]),
      experiment([{ scorer: "y", mean: 0.6, baseline: null }]),
    );
    expect(rows).toEqual([
      { scorer: "x", a: 0.5, b: null, baseline: 0.4, outcome: "only-a" },
      { scorer: "y", a: null, b: 0.6, baseline: null, outcome: "only-b" },
    ]);
  });
});
