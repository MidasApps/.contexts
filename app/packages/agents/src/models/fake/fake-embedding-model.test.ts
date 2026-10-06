import { cosineSimilarity } from "ai";
import { describe, expect, it } from "vitest";
import { createFakeEmbeddingModel, FAKE_EMBEDDING_DIMENSIONS } from "./fake-embedding-model.ts";

const embed = async (values: string[]): Promise<number[][]> => {
  const result = await createFakeEmbeddingModel().doEmbed({ values });
  return result.embeddings;
};

const norm = (vector: number[]): number => Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

describe("createFakeEmbeddingModel", () => {
  it("returns 1536-dimensional unit vectors", async () => {
    const [vector] = await embed(["Members join an organization after accepting an invitation."]);
    expect(FAKE_EMBEDDING_DIMENSIONS).toBe(1536);
    expect(vector).toHaveLength(1536);
    expect(norm(vector ?? [])).toBeCloseTo(1, 10);
  });

  it("is deterministic", async () => {
    expect(await embed(["same text"])).toEqual(await embed(["same text"]));
  });

  it("ranks similar texts above unrelated ones", async () => {
    const [query, similar, unrelated] = await embed([
      "how do invitations to an organization work",
      "Invitations add members to an organization when accepted.",
      "Quarterly revenue grew in the southern warehouse.",
    ]);
    if (query === undefined || similar === undefined || unrelated === undefined) throw new Error("missing embedding");
    expect(cosineSimilarity(query, similar)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });

  it("gives empty text a unit vector instead of NaN", async () => {
    const [vector] = await embed([""]);
    expect(norm(vector ?? [])).toBeCloseTo(1, 10);
  });

  it("reports token usage", async () => {
    const result = await createFakeEmbeddingModel().doEmbed({ values: ["one two", "three"] });
    expect(result.usage).toEqual({ tokens: 3 });
  });
});
