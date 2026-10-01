// Public API of the eval-experiment entity (SP5 Task 13): experiments and datasets as staff read them.
export {
  adminDatasetsQuery,
  adminExperimentsQuery,
  evalKeys,
  EXPERIMENTS_PAGE_SIZE,
  useAdminDatasets,
  useAdminExperiments,
  type ExperimentPage,
} from "./api/eval-queries.ts";
export { compareExperiments, type ScoreComparison, type ScoreOutcome } from "./lib/compare-experiments.ts";
