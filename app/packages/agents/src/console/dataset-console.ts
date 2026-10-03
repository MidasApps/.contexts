import { type EvalDataset, type EvalDatasetItem, EvalDatasetSchema } from "@core/contracts";
import type { Mastra } from "@mastra/core/mastra";

/** Name of the dataset each organization's thumbs-down feedback goes to (SP5 spec §8). */
export const FEEDBACK_DATASET_NAME = "feedback";

type Datasets = Mastra["datasets"];
type DatasetRecord = Awaited<ReturnType<Datasets["list"]>>["datasets"][number];

const toDataset = (record: DatasetRecord): EvalDataset | null => {
  const parsed = EvalDatasetSchema.safeParse({
    id: record.id,
    name: record.name,
    tenantId: record.organizationId ?? null,
    version: record.version,
    targetIds: record.targetIds ?? [],
    createdAt: record.createdAt.toISOString(),
  });
  return parsed.success ? parsed.data : null;
};

/** Datasets of a tenant (its own only) or all of them (`null`, staff). */
export const listDatasets = async (datasets: Datasets, tenantId: string | null): Promise<EvalDataset[]> => {
  const listed = await datasets.list({ perPage: 100, ...(tenantId === null ? {} : { filters: { organizationId: tenantId } }) });
  return listed.datasets
    .filter((record) => tenantId === null || record.organizationId === tenantId)
    .map(toDataset)
    .filter((dataset): dataset is EvalDataset => dataset !== null);
};

/** The tenant's `feedback` dataset, created on first use (target: the assistant). */
export const feedbackDatasetOf = async (datasets: Datasets, tenantId: string) => {
  const found = (await datasets.list({ perPage: 1, filters: { organizationId: tenantId, name: FEEDBACK_DATASET_NAME } })).datasets.find(
    (record) => record.organizationId === tenantId && record.name === FEEDBACK_DATASET_NAME,
  );
  if (found !== undefined) return datasets.get({ id: found.id, organizationId: tenantId });
  return datasets.create({ name: FEEDBACK_DATASET_NAME, description: "Rated assistant turns (production to dataset).", organizationId: tenantId, targetType: "agent", targetIds: ["assistant"] });
};

/**
 * Adds a rated message to the tenant's feedback dataset. Idempotent per message and user: the item's
 * `externalId` is the feedback key, so a second rating of the same message reuses the item.
 */
export const addFeedbackItem = async (
  datasets: Datasets,
  input: { readonly tenantId: string; readonly feedbackKey: string; readonly conversationId: string; readonly messageId: string; readonly rating: "up" | "down"; readonly comment: string | null },
): Promise<{ readonly datasetId: string; readonly itemId: string }> => {
  const dataset = await feedbackDatasetOf(datasets, input.tenantId);
  const item = await dataset.addItem({
    externalId: input.feedbackKey,
    input: { conversationId: input.conversationId, messageId: input.messageId },
    metadata: { rating: input.rating, ...(input.comment === null ? {} : { comment: input.comment }) },
  });
  return { datasetId: dataset.id, itemId: item.id };
};

type DatasetItemRecord = Awaited<ReturnType<Awaited<ReturnType<Datasets["get"]>>["addItem"]>>;

// Mastra keeps input and ground truth as free JSON; the view shows text (JSON for anything else).
const textOf = (value: unknown): string | null => (value === undefined || value === null ? null : typeof value === "string" ? value : JSON.stringify(value));

const toItem = (record: DatasetItemRecord): EvalDatasetItem => ({
  id: record.id,
  datasetId: record.datasetId,
  input: textOf(record.input) ?? "",
  expectedOutput: textOf(record.groundTruth),
  createdAt: new Date(record.createdAt).toISOString(),
});

/**
 * The tenant's own dataset, or `null` when it is missing, a platform one or another tenant's.
 * `get` with the organization already refuses another tenant; the record is checked again so an
 * ignored storage filter still leaks nothing (decision 0040).
 */
const tenantDatasetOf = async (datasets: Datasets, tenantId: string, datasetId: string) => {
  const dataset = await datasets.get({ id: datasetId, organizationId: tenantId }).catch(() => null);
  if (dataset === null) return null;
  const details = await dataset.getDetails().catch(() => null);
  return details?.organizationId === tenantId ? dataset : null;
};

/** A page of the items of the tenant's dataset (`page` from 0), or `null` (not its dataset). */
export const listDatasetItems = async (
  datasets: Datasets,
  query: { readonly tenantId: string; readonly datasetId: string; readonly page: number; readonly perPage: number },
): Promise<{ readonly items: EvalDatasetItem[]; readonly hasMore: boolean } | null> => {
  const dataset = await tenantDatasetOf(datasets, query.tenantId, query.datasetId);
  if (dataset === null) return null;
  const listed = await dataset.listItems({ page: query.page, perPage: query.perPage });
  if (Array.isArray(listed)) return { items: listed.map(toItem), hasMore: false };
  return { items: listed.items.map(toItem), hasMore: listed.pagination.hasMore };
};

/** Adds a manual item (input and optional expected answer), or `null` (not the tenant's dataset). */
export const addDatasetItem = async (
  datasets: Datasets,
  input: { readonly tenantId: string; readonly datasetId: string; readonly input: string; readonly expectedOutput?: string | undefined },
): Promise<EvalDatasetItem | null> => {
  const dataset = await tenantDatasetOf(datasets, input.tenantId, input.datasetId);
  if (dataset === null) return null;
  // A string input is what an agent target receives as its message (like the platform eval cases).
  const item = await dataset.addItem({ input: input.input, ...(input.expectedOutput === undefined ? {} : { groundTruth: input.expectedOutput }), metadata: { origin: "manual" } });
  return toItem(item);
};

/** Deletes an item of the tenant's dataset; `false` when the dataset or the item is not there. */
export const deleteDatasetItem = async (datasets: Datasets, input: { readonly tenantId: string; readonly datasetId: string; readonly itemId: string }): Promise<boolean> => {
  const dataset = await tenantDatasetOf(datasets, input.tenantId, input.datasetId);
  if (dataset === null) return false;
  const item = await dataset.getItem({ itemId: input.itemId });
  if (item === null || item.datasetId !== input.datasetId) return false;
  await dataset.deleteItem({ itemId: input.itemId });
  return true;
};

/**
 * Creates an empty dataset of the tenant targeting the assistant (the supervisor is always
 * evaluable), or `CONFLICT` when the tenant already has one of that name.
 */
export const createTenantDataset = async (
  datasets: Datasets,
  input: { readonly tenantId: string; readonly name: string },
): Promise<{ readonly ok: true; readonly data: EvalDataset } | { readonly ok: false; readonly code: "CONFLICT" }> => {
  const taken = (await listDatasets(datasets, input.tenantId)).some((dataset) => dataset.name === input.name);
  if (taken) return { ok: false, code: "CONFLICT" };
  const created = await datasets.create({ name: input.name, organizationId: input.tenantId, targetType: "agent", targetIds: ["assistant"] });
  const dataset = toDataset(await created.getDetails());
  if (dataset === null) throw new Error("created dataset does not match the contract");
  return { ok: true, data: dataset };
};
