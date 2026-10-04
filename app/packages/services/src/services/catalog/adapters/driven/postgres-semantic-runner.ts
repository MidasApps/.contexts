import type { ParameterOrJSON, Sql } from "postgres";
import { withTenantTransaction } from "#/services/shared/postgres/with-tenant-transaction.ts";
import type { SemanticQueryRows, SemanticQueryRunner } from "../../application/ports/driven/semantic-sql-ports.ts";
import { wrapWithLimit } from "./sql-guard.ts";

export const SEMANTIC_READER_ROLE = "semantic_reader";
export const DEFAULT_STATEMENT_TIMEOUT_MS = 5000;

// SQLSTATE 57014 query_canceled: raised when statement_timeout fires.
const QUERY_CANCELED = "57014";

const isQueryCanceled = (error: unknown): boolean =>
  error !== null && typeof error === "object" && "code" in error && error.code === QUERY_CANCELED;

type ResultRows = Record<string, unknown>[] & { columns?: readonly { name: string }[] };

const toRows = (result: ResultRows, limit: number): SemanticQueryRows => ({
  columns: (result.columns ?? []).map((column) => column.name),
  rows: result.slice(0, limit),
  truncated: result.length > limit,
});

/**
 * Runs a guarded statement (decision 0024): `BEGIN READ ONLY`, tenant settings
 * via `set_config(..., true)`, `SET LOCAL statement_timeout`, `SET LOCAL ROLE
 * semantic_reader`, then the statement wrapped with `LIMIT limit + 1` (to tell
 * whether it was truncated) and bound parameters only. Views are owned by
 * `semantic_owner` over `FORCE ROW LEVEL SECURITY` tables, so a missing tenant
 * setting yields zero rows. Database messages never leave this adapter.
 */
export const createPostgresSemanticRunner = (
  sql: Sql,
  options: { readonly statementTimeoutMs?: number } = {},
): SemanticQueryRunner => {
  const timeoutMs = Math.trunc(options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS);
  return {
    run: async ({ scope, sql: statement, params, limit }) => {
      try {
        const rows = await withTenantTransaction(
          sql,
          { tenantId: scope.tenantId, nodeIds: scope.nodeIds, readOnly: true },
          async (tx) => {
            // SET cannot take bind parameters; the value is an integer we computed.
            await tx.unsafe(`SET LOCAL statement_timeout = ${timeoutMs}`);
            await tx.unsafe(`SET LOCAL ROLE ${SEMANTIC_READER_ROLE}`);
            return (await tx.unsafe(
              wrapWithLimit(statement, limit + 1),
              params as ParameterOrJSON<never>[],
            )) as ResultRows;
          },
        );
        return { ok: true, data: toRows(rows, limit) };
      } catch (error: unknown) {
        return { ok: false, error: { code: isQueryCanceled(error) ? "QUERY_TIMEOUT" : "QUERY_FAILED" } };
      }
    },
  };
};
