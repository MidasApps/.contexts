import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it } from "vitest";
import { parseEvalDataset } from "./eval-dataset.ts";
import { seedEvalDatasets } from "./seed-datasets.ts";

const datasetOf = (text: string) => parseEvalDataset({ agentId: "data", version: 1, text });
const V1 = datasetOf(
  '{"id":"a","input":"Which entities exist?","expectedTools":["catalog.listEntities"]}\n{"id":"b","input":"Create a note"}\n',
);

const listItems = async (mastra: Mastra, datasetId: string) => {
  const dataset = await mastra.datasets.get({ id: datasetId });
  const items = await dataset.listItems();
  return Array.isArray(items) ? items : items.items;
};

describe("seedEvalDatasets", () => {
  it("creates one Mastra dataset per file version with the cases as items", async () => {
    const mastra = new Mastra({ storage: new InMemoryStore() });
    const [outcome] = await seedEvalDatasets({ mastra, datasets: [V1] });
    expect(outcome).toMatchObject({ name: "data.v1", status: "created", itemCount: 2 });
    const items = await listItems(mastra, outcome?.datasetId ?? "");
    expect(items.map((item) => item.input).sort()).toEqual(["Create a note", "Which entities exist?"]);
    expect(items.find((item) => item.input === "Which entities exist?")?.groundTruth).toMatchObject({
      expectedTools: ["catalog.listEntities"],
    });
  });

  it("is idempotent for an unchanged file", async () => {
    const mastra = new Mastra({ storage: new InMemoryStore() });
    await seedEvalDatasets({ mastra, datasets: [V1] });
    const [again] = await seedEvalDatasets({ mastra, datasets: [V1] });
    expect(again?.status).toBe("unchanged");
    expect(await listItems(mastra, again?.datasetId ?? "")).toHaveLength(2);
  });

  it("replaces the items when the file of the same version changed", async () => {
    const mastra = new Mastra({ storage: new InMemoryStore() });
    await seedEvalDatasets({ mastra, datasets: [V1] });
    const edited = datasetOf('{"id":"a","input":"Which entities exist?"}\n');
    const [updated] = await seedEvalDatasets({ mastra, datasets: [edited] });
    expect(updated).toMatchObject({ status: "updated", itemCount: 1 });
    expect(await listItems(mastra, updated?.datasetId ?? "")).toHaveLength(1);
  });
});
