import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it } from "vitest";
import {
  addDatasetItem,
  addFeedbackItem,
  createTenantDataset,
  deleteDatasetItem,
  deleteTenantDataset,
  feedbackDatasetOf,
  listDatasetItems,
  listDatasets,
  renameTenantDataset,
} from "./dataset-console.ts";

const TENANT = "org_a";
const OTHER = "org_b";

const datasetsOf = () => new Mastra({ storage: new InMemoryStore() }).datasets;

describe("tenant dataset items over Mastra datasets (follow-up 66)", () => {
  it("creates an empty dataset of the tenant that targets the assistant, and refuses a name the tenant already uses", async () => {
    const datasets = datasetsOf();
    const created = await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" });
    expect(created).toMatchObject({ ok: true, data: { name: "refunds", tenantId: TENANT, targetIds: ["assistant"] } });
    expect(await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" })).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    expect((await createTenantDataset(datasets, { tenantId: OTHER, name: "refunds" })).ok).toBe(true);
    expect((await listDatasets(datasets, TENANT)).map((dataset) => dataset.name)).toEqual(["refunds"]);
  });

  it("adds manual items and lists them as text, a structured input as JSON", async () => {
    const datasets = datasetsOf();
    const created = await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" });
    if (!created.ok) throw new Error("dataset not created");
    const added = await addDatasetItem(datasets, {
      tenantId: TENANT,
      datasetId: created.data.id,
      input: "Refund policy?",
      expectedOutput: "30 days.",
    });
    expect(added).toMatchObject({ datasetId: created.data.id, input: "Refund policy?", expectedOutput: "30 days." });
    await addDatasetItem(datasets, { tenantId: TENANT, datasetId: created.data.id, input: "No answer expected" });
    const listed = await listDatasetItems(datasets, {
      tenantId: TENANT,
      datasetId: created.data.id,
      page: 0,
      perPage: 20,
    });
    expect(listed?.items.map((item) => [item.input, item.expectedOutput]).sort()).toEqual([
      ["No answer expected", null],
      ["Refund policy?", "30 days."],
    ]);
    expect(listed?.hasMore).toBe(false);

    const feedback = await addFeedbackItem(datasets, {
      tenantId: TENANT,
      feedbackKey: "k1",
      conversationId: "c1",
      messageId: "m1",
      rating: "down",
      comment: null,
    });
    const feedbackItems = await listDatasetItems(datasets, {
      tenantId: TENANT,
      datasetId: feedback.datasetId,
      page: 0,
      perPage: 20,
    });
    expect(feedbackItems?.items[0]?.input).toBe(JSON.stringify({ conversationId: "c1", messageId: "m1" }));
  });

  it("deletes an item, and answers not found for a missing item", async () => {
    const datasets = datasetsOf();
    const created = await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" });
    if (!created.ok) throw new Error("dataset not created");
    const item = await addDatasetItem(datasets, {
      tenantId: TENANT,
      datasetId: created.data.id,
      input: "Refund policy?",
    });
    expect(
      await deleteDatasetItem(datasets, { tenantId: TENANT, datasetId: created.data.id, itemId: item?.id ?? "" }),
    ).toBe(true);
    expect(
      (await listDatasetItems(datasets, { tenantId: TENANT, datasetId: created.data.id, page: 0, perPage: 20 }))?.items,
    ).toEqual([]);
    expect(
      await deleteDatasetItem(datasets, { tenantId: TENANT, datasetId: created.data.id, itemId: item?.id ?? "" }),
    ).toBe(false);
  });

  it("never reads or changes another tenant's dataset", async () => {
    const datasets = datasetsOf();
    const theirs = await createTenantDataset(datasets, { tenantId: OTHER, name: "private" });
    if (!theirs.ok) throw new Error("dataset not created");
    const item = await addDatasetItem(datasets, {
      tenantId: OTHER,
      datasetId: theirs.data.id,
      input: "Secret question",
    });
    expect(
      await listDatasetItems(datasets, { tenantId: TENANT, datasetId: theirs.data.id, page: 0, perPage: 20 }),
    ).toBeNull();
    expect(
      await addDatasetItem(datasets, { tenantId: TENANT, datasetId: theirs.data.id, input: "Injected" }),
    ).toBeNull();
    expect(
      await deleteDatasetItem(datasets, { tenantId: TENANT, datasetId: theirs.data.id, itemId: item?.id ?? "" }),
    ).toBe(false);
    expect(
      (
        await listDatasetItems(datasets, { tenantId: OTHER, datasetId: theirs.data.id, page: 0, perPage: 20 })
      )?.items.map((entry) => entry.input),
    ).toEqual(["Secret question"]);
  });

  it("answers not found for a platform dataset, which has no tenant", async () => {
    const datasets = datasetsOf();
    const platform = await datasets.create({ name: "assistant.v1", targetType: "agent", targetIds: ["assistant"] });
    expect(
      await listDatasetItems(datasets, { tenantId: TENANT, datasetId: platform.id, page: 0, perPage: 20 }),
    ).toBeNull();
  });
});

describe("renaming and deleting a tenant dataset (decision 0075)", () => {
  it("renames a dataset, refusing a name the tenant uses and the feedback name", async () => {
    const datasets = datasetsOf();
    const refunds = await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" });
    await createTenantDataset(datasets, { tenantId: TENANT, name: "billing" });
    if (!refunds.ok) throw new Error("dataset not created");
    const datasetId = refunds.data.id;
    expect(await renameTenantDataset(datasets, { tenantId: TENANT, datasetId, name: "returns" })).toMatchObject({
      ok: true,
      data: { id: datasetId, name: "returns" },
    });
    expect(await renameTenantDataset(datasets, { tenantId: TENANT, datasetId, name: "billing" })).toEqual({
      ok: false,
      code: "CONFLICT",
    });
    expect(await renameTenantDataset(datasets, { tenantId: TENANT, datasetId, name: "feedback" })).toEqual({
      ok: false,
      code: "DATASET_RESERVED",
    });
    expect(await renameTenantDataset(datasets, { tenantId: OTHER, datasetId, name: "x" })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("deletes a dataset with its items, never the feedback one nor another tenant's", async () => {
    const datasets = datasetsOf();
    const refunds = await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" });
    if (!refunds.ok) throw new Error("dataset not created");
    await addDatasetItem(datasets, { tenantId: TENANT, datasetId: refunds.data.id, input: "Question" });
    const feedback = await feedbackDatasetOf(datasets, TENANT);
    expect(await deleteTenantDataset(datasets, { tenantId: OTHER, datasetId: refunds.data.id })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await deleteTenantDataset(datasets, { tenantId: TENANT, datasetId: feedback.id })).toEqual({
      ok: false,
      code: "DATASET_RESERVED",
    });
    expect(await deleteTenantDataset(datasets, { tenantId: TENANT, datasetId: refunds.data.id })).toEqual({
      ok: true,
      data: { datasetId: refunds.data.id },
    });
    expect((await listDatasets(datasets, TENANT)).map((dataset) => dataset.name)).toEqual(["feedback"]);
  });

  it("refuses to delete a dataset an experiment ran on", async () => {
    const datasets = datasetsOf();
    const refunds = await createTenantDataset(datasets, { tenantId: TENANT, name: "refunds" });
    if (!refunds.ok) throw new Error("dataset not created");
    await addDatasetItem(datasets, { tenantId: TENANT, datasetId: refunds.data.id, input: "Question" });
    const dataset = await datasets.get({ id: refunds.data.id, organizationId: TENANT });
    await dataset.createExperiment({ name: "run" });
    expect(await deleteTenantDataset(datasets, { tenantId: TENANT, datasetId: refunds.data.id })).toEqual({
      ok: false,
      code: "DATASET_IN_USE",
    });
  });
});
