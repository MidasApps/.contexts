// Public API of the evals context (SP5 Task 7): the warehouse export of eval experiment summaries.
export type { EvalRunSink } from "./application/ports/eval-run-sink.ts";
export {
  type BigQueryEvalRunRow,
  createBigQueryEvalRunSink,
  createNoopEvalRunSink,
  EVAL_RUNS_TABLE,
  type EvalRunsTableLike,
  toEvalRunRows,
} from "./adapters/driven/eval-run-sink.ts";
