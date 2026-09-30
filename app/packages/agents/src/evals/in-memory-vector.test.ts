import { describe, expect, it } from "vitest";
import { InMemoryVector, UnsupportedVectorFilterError } from "./in-memory-vector.ts";

const seeded = async () => {
  const vector = new InMemoryVector();
  await vector.createIndex({ indexName: "memory_messages", dimension: 2 });
  await vector.upsert({
    indexName: "memory_messages",
    vectors: [[1, 0], [0, 1], [1, 0.1]],
    metadata: [{ resource_id: "t1:u", thread_id: "a" }, { resource_id: "t1:u", thread_id: "b" }, { resource_id: "t2:u", thread_id: "c" }],
    ids: ["m1", "m2", "m3"],
  });
  return vector;
};

describe("InMemoryVector", () => {
  it("ranks by cosine similarity inside the filtered resource only", async () => {
    const vector = await seeded();
    const results = await vector.query({ indexName: "memory_messages", queryVector: [1, 0], topK: 5, filter: { resource_id: "t1:u" } });
    expect(results.map((result) => result.id)).toEqual(["m1", "m2"]);
    expect(results[0]?.score).toBeCloseTo(1);
  });

  it("supports $and and $eq equality filters", async () => {
    const vector = await seeded();
    const results = await vector.query({ indexName: "memory_messages", queryVector: [1, 0], filter: { $and: [{ resource_id: "t1:u" }, { thread_id: { $eq: "b" } }] } });
    expect(results.map((result) => result.id)).toEqual(["m2"]);
  });

  it("refuses filter operators it does not implement", async () => {
    const vector = await seeded();
    await expect(vector.query({ indexName: "memory_messages", queryVector: [1, 0], filter: { thread_id: { $in: ["a"] } } })).rejects.toBeInstanceOf(UnsupportedVectorFilterError);
  });

  it("describes, updates and deletes vectors", async () => {
    const vector = await seeded();
    expect(await vector.describeIndex({ indexName: "memory_messages" })).toEqual({ dimension: 2, count: 3, metric: "cosine" });
    await vector.updateVector({ indexName: "memory_messages", id: "m1", update: { metadata: { thread_id: "z" } } });
    await vector.deleteVectors({ indexName: "memory_messages", filter: { resource_id: "t2:u" } });
    await vector.deleteVector({ indexName: "memory_messages", id: "m2" });
    const remaining = await vector.query({ indexName: "memory_messages", queryVector: [1, 0] });
    expect(remaining).toEqual([expect.objectContaining({ id: "m1", metadata: { resource_id: "t1:u", thread_id: "z" } })]);
  });

  it("refuses a second index with another dimension", async () => {
    const vector = await seeded();
    await expect(vector.createIndex({ indexName: "memory_messages", dimension: 3 })).rejects.toThrow(/dimension/);
  });
});
