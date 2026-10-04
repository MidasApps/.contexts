import { describe, expect, it } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { datasetRefusal, itemBody, validateDatasetName, validateItemDraft } from "./dataset-drafts.ts";

describe("dataset drafts", () => {
  it("requires a dataset name and tells a name the organization already uses", () => {
    expect(validateDatasetName("  ")).toBe("nameRequired");
    expect(validateDatasetName("refunds")).toBeUndefined();
    expect(datasetRefusal(new ApiError({ status: 409, code: "CONFLICT", message: "x" }))).toBe("nameTaken");
    expect(datasetRefusal(new ApiError({ status: 503, code: "UPSTREAM_UNAVAILABLE", message: "x" }))).toBeNull();
    expect(datasetRefusal(new Error("boom"))).toBeNull();
  });

  it("requires an input; the expected answer is optional", () => {
    expect(validateItemDraft({ input: " ", expectedOutput: "" })).toEqual({ input: "inputRequired" });
    expect(validateItemDraft({ input: "Hi", expectedOutput: "" })).toEqual({});
  });

  it("sends trimmed texts and leaves out an empty expected answer", () => {
    expect(itemBody({ input: " Refund policy? ", expectedOutput: "  " })).toEqual({ input: "Refund policy?" });
    expect(itemBody({ input: "Refund policy?", expectedOutput: " 30 days. " })).toEqual({
      input: "Refund policy?",
      expectedOutput: "30 days.",
    });
  });
});
