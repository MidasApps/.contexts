import { type EvalDataset, EvalDatasetSchema } from "@core/contracts";
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
