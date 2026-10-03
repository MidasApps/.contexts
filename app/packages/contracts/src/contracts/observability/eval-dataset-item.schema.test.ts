import { describe, expect, it } from "vitest";
import {
  AddEvalDatasetItemInputContract,
  AddEvalDatasetItemInputSchema,
  CreateEvalDatasetInputContract,
  CreateEvalDatasetInputSchema,
  EvalDatasetItemContract,
} from "./eval-dataset-item.schema.ts";
import { addEvalDatasetItemEndpoint, createEvalDatasetEndpoint, deleteEvalDatasetItemEndpoint, listEvalDatasetItemsEndpoint, OBSERVABILITY_ENDPOINTS } from "./endpoints.ts";

const contracts = [EvalDatasetItemContract, AddEvalDatasetItemInputContract, CreateEvalDatasetInputContract];

describe("eval dataset item contracts (follow-up 66)", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses and an unknown key is refused", (_id, contract) => {
    expect(contract.meta.examples.length).toBeGreaterThan(0);
    for (const example of contract.meta.examples) {
      expect(contract.schema.safeParse(example).success).toBe(true);
      expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
    }
  });

  it("needs a non-blank input and caps both texts at 4000 characters", () => {
    expect(AddEvalDatasetItemInputSchema.safeParse({ input: "   " }).success).toBe(false);
    expect(AddEvalDatasetItemInputSchema.safeParse({ input: "x".repeat(4001) }).success).toBe(false);
    expect(AddEvalDatasetItemInputSchema.safeParse({ input: "Hi", expectedOutput: "x".repeat(4001) }).success).toBe(false);
    expect(AddEvalDatasetItemInputSchema.safeParse({ input: "Hi" }).success).toBe(true);
  });

  it("trims the dataset name and refuses a blank one", () => {
    expect(CreateEvalDatasetInputSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(CreateEvalDatasetInputSchema.parse({ name: "  smoke  " })).toEqual({ name: "smoke" });
  });

  it("marks the texts a member types as personal data", () => {
    expect(AddEvalDatasetItemInputContract.meta.pii).toBe("personal");
    expect(EvalDatasetItemContract.meta.pii).toBe("personal");
  });

  it("registers the item endpoints under /v1/evals/datasets", () => {
    expect(OBSERVABILITY_ENDPOINTS).toEqual(expect.arrayContaining([listEvalDatasetItemsEndpoint, addEvalDatasetItemEndpoint, deleteEvalDatasetItemEndpoint, createEvalDatasetEndpoint]));
    expect(listEvalDatasetItemsEndpoint.path).toBe("/v1/evals/datasets/{datasetId}/items");
    expect(deleteEvalDatasetItemEndpoint.method).toBe("DELETE");
    expect(createEvalDatasetEndpoint.path).toBe("/v1/evals/datasets");
  });
});
