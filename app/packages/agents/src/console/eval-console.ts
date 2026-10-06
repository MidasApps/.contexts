import { type EvalExperimentSummary, EvalExperimentSummarySchema } from "@core/contracts";
import { z } from "zod";

/** The parts of a stored Mastra experiment the console reads (`mastra_experiments`). */
export type StoredExperiment = {
  readonly id: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly datasetId: string | null;
  readonly targetId: string | null;
  readonly status: "pending" | "running" | "completed" | "failed";
  readonly totalItems: number;
  readonly organizationId?: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
};

/** The experiments storage domain calls the console makes (`storage.getStore("experiments")`). */
export type ExperimentStore = {
  readonly listExperiments: (args: {
    readonly filters?: { readonly organizationId?: string };
    readonly pagination: { readonly page: number; readonly perPage: number };
  }) => Promise<{
    readonly experiments: readonly StoredExperiment[];
    readonly pagination: { readonly hasMore: boolean };
  }>;
  readonly getExperimentById: (args: {
    readonly id: string;
    readonly filters?: { readonly organizationId?: string };
  }) => Promise<StoredExperiment | null>;
  readonly createExperiment: (input: {
    readonly name: string;
    readonly datasetId: null;
    readonly datasetVersion: number | null;
    readonly targetType: "agent";
    readonly targetId: string;
    readonly totalItems: number;
    readonly metadata: Record<string, unknown>;
    readonly organizationId: string | null;
  }) => Promise<{ readonly id: string }>;
  readonly updateExperiment: (input: {
    readonly id: string;
    readonly status: "completed";
    readonly startedAt: Date;
    readonly completedAt: Date;
  }) => Promise<unknown>;
};

const ScoreSchema = z.strictObject({
  scorer: z.string().min(1),
  mean: z.number().min(0).max(1),
  baseline: z.number().min(0).max(1).nullable(),
});

/** What an eval run records on its experiment (CI publish, prompt evals; decision 0040). */
export const EvalRunRecordSchema = z.strictObject({
  agentId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  datasetName: z.string().min(1).max(200),
  datasetVersion: z.int().positive().nullable(),
  itemCount: z.int().nonnegative(),
  scores: z.array(ScoreSchema).max(50),
  verdict: z.enum(["passed", "failed"]),
  source: z.enum(["ci", "prompt-eval"]),
  promptVersionId: z.uuid().nullable(),
  gitSha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecordSchema>;

const MetadataSchema = z.looseObject({
  scores: z.array(ScoreSchema).optional(),
  verdict: z.enum(["passed", "failed"]).optional(),
  promptVersionId: z.uuid().nullable().optional(),
  datasetName: z.string().optional(),
  agentId: z.string().optional(),
});

/** One experiment as `/admin/evals` and `/settings/evals` list it; `null` when it does not fit the contract. */
export const summarizeExperiment = (experiment: StoredExperiment): EvalExperimentSummary | null => {
  const metadata = MetadataSchema.safeParse(experiment.metadata ?? {});
  const meta = metadata.success ? metadata.data : {};
  const parsed = EvalExperimentSummarySchema.safeParse({
    experimentId: experiment.id,
    datasetId: experiment.datasetId ?? meta.datasetName ?? "unknown",
    agentId: experiment.targetId ?? meta.agentId ?? "unknown",
    promptVersionId: meta.promptVersionId ?? null,
    status: experiment.status,
    itemCount: experiment.totalItems,
    scores: meta.scores ?? [],
    verdict: meta.verdict ?? "pending",
    startedAt: (experiment.startedAt ?? experiment.createdAt).toISOString(),
    finishedAt: experiment.completedAt?.toISOString() ?? null,
  });
  return parsed.success ? parsed.data : null;
};

/**
 * Records an eval run as a completed Mastra experiment (CI reports published by `pnpm
 * evals:publish`, prompt evals of decision 0038), so the console and the `eval-export` workflow
 * read one store. Tenant prompt evals carry the tenant as `organizationId`.
 * @returns the experiment id.
 */
export const recordEvalRun = async (
  store: ExperimentStore,
  run: EvalRunRecord,
  organizationId: string | null,
): Promise<string> => {
  const created = await store.createExperiment({
    name: `${run.source}:${run.agentId}`,
    datasetId: null,
    datasetVersion: run.datasetVersion,
    targetType: "agent",
    targetId: run.agentId,
    totalItems: run.itemCount,
    metadata: { ...run },
    organizationId,
  });
  await store.updateExperiment({
    id: created.id,
    status: "completed",
    startedAt: new Date(run.startedAt),
    completedAt: new Date(run.finishedAt),
  });
  return created.id;
};

/** Experiments of a tenant (its own only) or of the platform (`null`, staff: all), newest first. */
export const listExperimentSummaries = async (
  store: Pick<ExperimentStore, "listExperiments">,
  query: { readonly tenantId: string | null; readonly page: number; readonly perPage: number },
): Promise<{ readonly experiments: EvalExperimentSummary[]; readonly hasMore: boolean }> => {
  const listed = await store.listExperiments({
    ...(query.tenantId === null ? {} : { filters: { organizationId: query.tenantId } }),
    pagination: { page: query.page, perPage: query.perPage },
  });
  const own = listed.experiments.filter(
    (experiment) => query.tenantId === null || experiment.organizationId === query.tenantId,
  );
  return {
    experiments: own.map(summarizeExperiment).filter((summary): summary is EvalExperimentSummary => summary !== null),
    hasMore: listed.pagination.hasMore,
  };
};

/**
 * One experiment by id, for the comparison of two experiments on different list pages: any for
 * staff (`null`), a tenant's own only. The store filters by tenant and the owner is checked again
 * here, so another tenant's experiment is `null` (404) whatever the store does with the filter.
 */
export const getExperimentSummary = async (
  store: Pick<ExperimentStore, "getExperimentById">,
  query: { readonly experimentId: string; readonly tenantId: string | null },
): Promise<EvalExperimentSummary | null> => {
  const stored = await store.getExperimentById({
    id: query.experimentId,
    ...(query.tenantId === null ? {} : { filters: { organizationId: query.tenantId } }),
  });
  if (stored === null || (query.tenantId !== null && stored.organizationId !== query.tenantId)) return null;
  return summarizeExperiment(stored);
};

/** Finished experiments since an instant (the `eval-export` workflow's source, decision 0040). */
export const listFinishedSince = async (
  store: Pick<ExperimentStore, "listExperiments">,
  since: string,
): Promise<EvalExperimentSummary[]> => {
  const cutoff = Date.parse(since);
  const found: EvalExperimentSummary[] = [];
  for (let page = 0; page < 20; page += 1) {
    const listed = await store.listExperiments({ pagination: { page, perPage: 100 } });
    for (const experiment of listed.experiments) {
      const summary =
        experiment.status === "completed" &&
        experiment.completedAt !== null &&
        experiment.completedAt.getTime() >= cutoff
          ? summarizeExperiment(experiment)
          : null;
      if (summary !== null) found.push(summary);
    }
    if (!listed.pagination.hasMore) break;
  }
  return found;
};
