import type { Sql } from "postgres";
import type { TraceCostReader, TraceLedgerCost } from "../../../observability/application/ports/trace-cost-reader.ts";
import { withTenantTransaction } from "../../../shared/postgres/with-tenant-transaction.ts";
import { USAGE_RUNTIME_ROLE } from "./postgres-usage-repository.ts";

type CostRow = { trace_id: string; cost_micro_usd: string; unpriced_calls: string };

/**
 * Cost per trace from `usage.llm_calls` (decisions 0026 and 0044): one grouped read for the
 * traces of one tenant, as `usage_runtime` under that tenant's row level security. The
 * `occurred_at` range keeps it on `llm_calls_tenant_occurred_idx`; `trace_id` has no index.
 */
export const createPostgresTraceCosts = (sql: Sql): TraceCostReader => ({
  costByTrace: ({ tenantId, traceIds, from, to }) =>
    withTenantTransaction(sql, { tenantId, readOnly: true }, async (tx): Promise<ReadonlyMap<string, TraceLedgerCost>> => {
      await tx.unsafe(`SET LOCAL ROLE ${USAGE_RUNTIME_ROLE}`);
      const rows = await tx<CostRow[]>`
        SELECT trace_id, coalesce(sum(cost_micro_usd), 0) AS cost_micro_usd, count(*) FILTER (WHERE cost_micro_usd IS NULL) AS unpriced_calls
        FROM usage.llm_calls
        WHERE tenant_id = ${tenantId} AND occurred_at >= ${from} AND occurred_at < ${to} AND trace_id = ANY(${[...traceIds]})
        GROUP BY trace_id`;
      // Sums are bigint (strings in postgres.js); one trace stays far below 2^53 micro-USD.
      return new Map(rows.map((row) => [row.trace_id, { costMicroUsd: Number(row.cost_micro_usd), unpricedCalls: Number(row.unpriced_calls) }]));
    }),
});
