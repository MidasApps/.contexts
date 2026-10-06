import { describe, expect, it } from "vitest";
import { createFakeEmbeddingModel, FAKE_EMBEDDING_DIMENSIONS } from "../models/fake/fake-embedding-model.ts";
import { toEmbeddingModelV3 } from "./embedding-model-v3.ts";

describe("toEmbeddingModelV3", () => {
  it("gives memory a v3 view of the same model and the same vectors", async () => {
    const model = createFakeEmbeddingModel();
    const v3 = toEmbeddingModelV3(model);
    expect(v3).toMatchObject({ specificationVersion: "v3", provider: model.provider, modelId: model.modelId });
    const [direct, viaV3] = await Promise.all([
      model.doEmbed({ values: ["tenant memory"] }),
      v3.doEmbed({ values: ["tenant memory"] }),
    ]);
    expect(viaV3.embeddings).toEqual(direct.embeddings);
    expect(viaV3.embeddings[0]).toHaveLength(FAKE_EMBEDDING_DIMENSIONS);
  });
});
