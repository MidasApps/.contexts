// Public API of the catalog context (SP3 Task 11): read-only SQL over semantic views.
export { createBigQuerySemanticRunner } from "./adapters/driven/bigquery-semantic-runner.ts";
export {
  createPostgresSemanticRunner,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  SEMANTIC_READER_ROLE,
} from "./adapters/driven/postgres-semantic-runner.ts";
export { guardSemanticSql, MAX_SQL_LENGTH, wrapWithLimit } from "./adapters/driven/sql-guard.ts";
export type {
  GuardedSql,
  SemanticQueryRows,
  SemanticQueryRunner,
  SemanticQueryScope,
  SemanticRunnerFailure,
  SemanticSqlGuard,
  SqlParam,
  SqlRejection,
  SqlRejectionReason,
} from "./application/ports/driven/semantic-sql-ports.ts";
export {
  DEFAULT_SEMANTIC_LIMIT,
  makeRunSemanticQuery,
  MAX_SEMANTIC_LIMIT,
  MAX_SEMANTIC_PARAMS,
  type RunSemanticQuery,
  type RunSemanticQueryError,
  type RunSemanticQueryInput,
  type SemanticQueryPrincipal,
  type SemanticQueryResult,
} from "./application/use-cases/run-semantic-query.ts";
export {
  createSemanticViewRegistry,
  InvalidSemanticViewError,
  SEMANTIC_SCHEMA,
  type SemanticView,
  type SemanticViewRegistry,
} from "./domain/semantic-view.ts";
