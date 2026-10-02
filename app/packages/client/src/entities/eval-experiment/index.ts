// Public API of the eval-experiment entity (SP5 Task 13): experiments and datasets as staff read them.
export {
  adminDatasetsQuery,
  adminExperimentQuery,
  adminExperimentsQuery,
  evalKeys,
  EXPERIMENTS_PAGE_SIZE,
  useAdminDatasets,
  useAdminExperiments,
  type ExperimentPage,
} from "./api/eval-queries.ts";
export { compareExperiments, type ScoreComparison, type ScoreOutcome } from "./lib/compare-experiments.ts";
// SP5 Task 14: an organization's own datasets and experiments (`/v1/evals/*`).
export {
  tenantDatasetsQuery,
  tenantEvalKeys,
  tenantExperimentQuery,
  tenantExperimentsQuery,
  useTenantDatasets,
  useTenantExperiments,
} from "./api/tenant-eval-queries.ts";
// Decision 0049: the chosen experiments of a comparison, from the page or read by id.
export {
  type ChosenExperiment,
  type ExperimentPair,
  type ExperimentPairState,
  resolveExperimentPair,
  useAdminExperimentPair,
  useTenantExperimentPair,
} from "./model/use-experiment-pair.ts";
