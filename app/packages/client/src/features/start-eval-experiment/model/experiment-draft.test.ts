import { describe, expect, it } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { evaluableAgents, refusalProblems, validateExperimentDraft } from "./experiment-draft.ts";

describe("experiment draft", () => {
  it("offers the supervisor first, then the enabled subagents, without repeating it", () => {
    expect(evaluableAgents({ enabledAgents: ["knowledge", "assistant", "data"] })).toEqual(["assistant", "knowledge", "data"]);
    expect(evaluableAgents(undefined)).toEqual(["assistant"]);
  });

  it("requires a dataset and an agent", () => {
    expect(validateExperimentDraft({ datasetId: "", agentId: "" })).toEqual({ dataset: "datasetRequired", agent: "agentRequired" });
    expect(validateExperimentDraft({ datasetId: "ds_1", agentId: "assistant" })).toEqual({});
  });

  it("pins a disabled agent and a missing dataset to their fields, and nothing else", () => {
    const notEnabled = new ApiError({ status: 400, code: "VALIDATION_FAILED", message: "x", details: [{ field: "agentId", issue: "AGENT_NOT_ENABLED" }] });
    expect(refusalProblems(notEnabled)).toEqual({ agent: "agentNotEnabled" });
    expect(refusalProblems(new ApiError({ status: 404, code: "NOT_FOUND", message: "x" }))).toEqual({ dataset: "datasetNotFound" });
    expect(refusalProblems(new ApiError({ status: 400, code: "VALIDATION_FAILED", message: "x" }))).toBeNull();
    expect(refusalProblems(new ApiError({ status: 503, code: "UPSTREAM_UNAVAILABLE", message: "x" }))).toBeNull();
    expect(refusalProblems(new Error("boom"))).toBeNull();
  });
});
