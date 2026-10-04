import type { Mastra } from "@mastra/core";
import type { Dataset } from "@mastra/core/datasets";
import type { EvalDataset } from "./eval-dataset.ts";

/**
 * Copies the JSONL eval sets into Mastra datasets (`pnpm evals:seed`, decision 0028),
 * so Studio and experiments see the same cases the CI gate runs. One Mastra dataset
 * per file version (`<agent>.v<N>`); Mastra versions its items on every change.
 * Idempotent: an unchanged file (same SHA-256) is skipped.
 */

export type SeedOutcome = {
  readonly name: string;
  readonly datasetId: string;
  readonly status: "created" | "updated" | "unchanged";
  readonly itemCount: number;
};

type Items = Awaited<ReturnType<Dataset["listItems"]>>;
const itemsOf = (items: Items) => (Array.isArray(items) ? items : items.items);

const findDataset = async (mastra: Mastra, name: string) => {
  const { datasets } = await mastra.datasets.list({ filters: { name }, perPage: 100 });
  return datasets.find((record) => record.name === name);
};

const payloadsOf = (dataset: EvalDataset) =>
  dataset.cases.map((item) => ({
    // Tied to the file hash: an edited file of the same version gets fresh identities.
    externalId: `${item.id}@${dataset.sha256.slice(0, 12)}`,
    input: item.input,
    groundTruth: item.groundTruth,
    metadata: { caseId: item.id, tags: [...item.tags] },
  }));

const metadataOf = (dataset: EvalDataset) => ({
  source: "packages/agents/evals/datasets",
  agentId: dataset.agentId,
  version: dataset.version,
  sha256: dataset.sha256,
});

const replaceItems = async (dataset: Dataset, source: EvalDataset): Promise<void> => {
  const existing = itemsOf(await dataset.listItems({ perPage: 1000 }));
  if (existing.length > 0) await dataset.deleteItems({ itemIds: existing.map((item) => item.id) });
  await dataset.addItems({ items: payloadsOf(source) });
};

const seedOne = async (mastra: Mastra, source: EvalDataset): Promise<SeedOutcome> => {
  const record = await findDataset(mastra, source.name);
  const itemCount = source.cases.length;
  if (record === undefined) {
    const dataset = await mastra.datasets.create({
      name: source.name,
      description: `Core eval set of the ${source.agentId} agent (version ${source.version}).`,
      metadata: metadataOf(source),
      targetType: "agent",
      targetIds: [source.agentId],
    });
    await dataset.addItems({ items: payloadsOf(source) });
    return { name: source.name, datasetId: dataset.id, status: "created", itemCount };
  }
  if (record.metadata?.["sha256"] === source.sha256)
    return { name: source.name, datasetId: record.id, status: "unchanged", itemCount };
  const dataset = await mastra.datasets.get({ id: record.id });
  await replaceItems(dataset, source);
  await dataset.update({ metadata: metadataOf(source) });
  return { name: source.name, datasetId: record.id, status: "updated", itemCount };
};

export const seedEvalDatasets = async (args: {
  readonly mastra: Mastra;
  readonly datasets: readonly EvalDataset[];
}): Promise<SeedOutcome[]> => {
  const outcomes: SeedOutcome[] = [];
  // Sequential: one storage writer, readable logs, no partial interleaving.
  for (const dataset of args.datasets) outcomes.push(await seedOne(args.mastra, dataset));
  return outcomes;
};
