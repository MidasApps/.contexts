import type { SemanticQueryRunner } from "../../application/ports/driven/semantic-sql-ports.ts";

/**
 * BigQuery stays fail-closed in v1 (decision 0024 §6): every call answers
 * `CONNECTOR_DISABLED` and nothing is sent to BigQuery. The isolation design for
 * a later subproject (tenant-injected table functions in `<context>_semantic`
 * datasets, BigQuery-grammar AST guard, `maximumBytesBilled` cap and dry-run
 * approval at half the cap) is recorded in the decision.
 */
export const createBigQuerySemanticRunner = (): SemanticQueryRunner => ({
  run: () => Promise.resolve({ ok: false, error: { code: "CONNECTOR_DISABLED" } }),
});
