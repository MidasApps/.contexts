import type { EvalExperimentSummary } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { resolveExperimentPair } from "./use-experiment-pair.ts";

const experiment = (experimentId: string) => ({ experimentId }) as EvalExperimentSummary;
const found = (experimentId: string) => ({ kind: "found", experiment: experiment(experimentId) }) as const;

describe("resolveExperimentPair", () => {
  it("is idle with nothing chosen, one with A, ready with both", () => {
    expect(resolveExperimentPair([])).toEqual({ status: "idle" });
    expect(resolveExperimentPair([found("a")])).toEqual({ status: "one", a: experiment("a") });
    expect(resolveExperimentPair([found("a"), found("b")])).toEqual({
      status: "ready",
      a: experiment("a"),
      b: experiment("b"),
    });
  });

  it("waits for a read still on its way", () => {
    expect(resolveExperimentPair([found("a"), { kind: "pending" }])).toEqual({ status: "pending" });
  });

  it("says a chosen experiment is gone before anything else, then a failed read", () => {
    const error = new Error("boom");
    expect(resolveExperimentPair([{ kind: "error", error }, { kind: "missing" }])).toEqual({ status: "missing" });
    expect(resolveExperimentPair([{ kind: "pending" }, { kind: "error", error }])).toEqual({ status: "error", error });
  });
});
