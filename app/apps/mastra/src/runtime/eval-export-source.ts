import { type EvalExportPort, type ExperimentStore, listFinishedSince } from "@core/agents";
import type { MastraCompositeStore } from "@mastra/core/storage";

/**
 * The `eval-export` source (SP5 Task 11, decision 0040): finished experiments of the Mastra
 * experiments store (CI runs published by `pnpm evals:publish`, prompt evals, tenant experiments)
 * with their per-scorer means. Replaces the unwired source of the Task 7 binding; the sink stays.
 */
export const withExperimentSource = (port: EvalExportPort, storage: MastraCompositeStore): EvalExportPort => ({
  ...port,
  listFinishedSince: async ({ since }) => {
    const store = (await storage.getStore("experiments")) as ExperimentStore | undefined;
    return store === undefined ? [] : listFinishedSince(store, since);
  },
});
