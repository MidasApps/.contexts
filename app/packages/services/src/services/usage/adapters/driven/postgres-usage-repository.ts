import type { LlmCall } from "@core/contracts";
import type { Sql, TransactionSql } from "postgres";
import { withTenantTransaction } from "../../../shared/postgres/with-tenant-transaction.ts";
import type { ModelTotals, StoredBudget, UsageRepository, UsageTotals } from "../../application/ports/usage-repository.ts";

/** NOLOGIN role every usage query runs as (migration 0007): no BYPASSRLS, append-only on the ledger. */
export const USAGE_RUNTIME_ROLE = "usage_runtime";

// Every transaction switches to the runtime role, so the policies apply even when the
// login role could bypass them (a local superuser); tenant settings come from withTenantTransaction.
const asRuntime = async (tx: TransactionSql): Promise<void> => {
  await tx.unsafe(`SET LOCAL ROLE ${USAGE_RUNTIME_ROLE}`);
};

type TotalsRow = { calls: string; input_tokens: string; output_tokens: string; cost_micro_usd: string; unpriced_calls: string };

// Aggregates are bigint (strings in postgres.js); month totals of one tenant stay far below 2^53.
const toTotals = (row: TotalsRow | undefined): UsageTotals => ({
  calls: Number(row?.calls ?? 0),
  inputTokens: Number(row?.input_tokens ?? 0),
  outputTokens: Number(row?.output_tokens ?? 0),
  costMicroUsd: Number(row?.cost_micro_usd ?? 0),
  unpricedCalls: Number(row?.unpriced_calls ?? 0),
});

const toRow = (call: LlmCall) => ({
  id: call.id,
  request_id: call.requestId,
  trace_id: call.traceId,
  tenant_id: call.tenantId,
  user_id: call.userId,
  agent_id: call.agentId,
  provider: call.provider,
  model: call.model,
  input_tokens: call.inputTokens,
  output_tokens: call.outputTokens,
  cached_tokens: call.cachedTokens,
  cost_micro_usd: call.costMicroUsd,
  latency_ms: call.latencyMs,
  finish_reason: call.finishReason,
  occurred_at: new Date(call.occurredAt),
});

const groupByTenant = (calls: readonly LlmCall[]): Map<string, LlmCall[]> => {
  const groups = new Map<string, LlmCall[]>();
  for (const call of calls) groups.set(call.tenantId, [...(groups.get(call.tenantId) ?? []), call]);
  return groups;
};

// One transaction per tenant: row level security checks every row against app.tenant_id.
const insertCalls = (sql: Sql) => async (calls: readonly LlmCall[]): Promise<number> => {
  let inserted = 0;
  for (const [tenantId, rows] of groupByTenant(calls)) {
    inserted += await withTenantTransaction(sql, { tenantId }, async (tx) => {
      await asRuntime(tx);
      const result = await tx`INSERT INTO usage.llm_calls ${tx(rows.map(toRow))} ON CONFLICT (id) DO NOTHING RETURNING id`;
      return result.length;
    });
  }
  return inserted;
};

// Range on occurred_at (index llm_calls_tenant_occurred_idx): the hot path of every budget check.
const monthRange = (monthStart: Date): { start: Date; end: Date } => ({
  start: monthStart,
  end: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)),
});

const getMonthSpend = (sql: Sql) => (input: { tenantId: string; monthStart: Date }): Promise<UsageTotals> =>
  withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
    await asRuntime(tx);
    const { start, end } = monthRange(input.monthStart);
    const [row] = await tx<TotalsRow[]>`
      SELECT count(*) AS calls, coalesce(sum(input_tokens), 0) AS input_tokens, coalesce(sum(output_tokens), 0) AS output_tokens,
             coalesce(sum(cost_micro_usd), 0) AS cost_micro_usd, count(*) FILTER (WHERE cost_micro_usd IS NULL) AS unpriced_calls
      FROM usage.llm_calls
      WHERE tenant_id = ${input.tenantId} AND occurred_at >= ${start} AND occurred_at < ${end}`;
    return toTotals(row);
  });

const getMonthByModel = (sql: Sql) => (input: { tenantId: string; monthStart: Date }): Promise<readonly ModelTotals[]> =>
  withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
    await asRuntime(tx);
    const { start, end } = monthRange(input.monthStart);
    const rows = await tx<(TotalsRow & { provider: string; model: string })[]>`
      SELECT provider, model, count(*) AS calls, coalesce(sum(input_tokens), 0) AS input_tokens, coalesce(sum(output_tokens), 0) AS output_tokens,
             coalesce(sum(cost_micro_usd), 0) AS cost_micro_usd, count(*) FILTER (WHERE cost_micro_usd IS NULL) AS unpriced_calls
      FROM usage.llm_calls
      WHERE tenant_id = ${input.tenantId} AND occurred_at >= ${start} AND occurred_at < ${end}
      GROUP BY provider, model
      ORDER BY coalesce(sum(cost_micro_usd), 0) DESC, provider, model`;
    return rows.map((row) => ({ provider: row.provider, model: row.model, totals: toTotals(row) }));
  });

const getTenantBudget = (sql: Sql) => (input: { tenantId: string }): Promise<StoredBudget | null> =>
  withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
    await asRuntime(tx);
    const [row] = await tx<{ monthly_micro_usd: string; monthly_tokens: string }[]>`
      SELECT monthly_micro_usd, monthly_tokens FROM usage.tenant_budgets WHERE tenant_id = ${input.tenantId}`;
    // Numbers beyond 2^53 become unsafe and fall back to the plan default in budget-policy.ts.
    return row === undefined ? null : { monthlyMicroUsd: Number(row.monthly_micro_usd), monthlyTokens: Number(row.monthly_tokens) };
  });

// usage_runtime may INSERT and UPDATE budgets (migration 0007); one row per tenant (tenant_budgets_tenant_key).
const setTenantBudget = (sql: Sql) => (input: { tenantId: string; budget: StoredBudget }): Promise<void> =>
  withTenantTransaction(sql, { tenantId: input.tenantId }, async (tx) => {
    await asRuntime(tx);
    await tx`
      INSERT INTO usage.tenant_budgets (tenant_id, monthly_micro_usd, monthly_tokens)
      VALUES (${input.tenantId}, ${input.budget.monthlyMicroUsd}, ${input.budget.monthlyTokens})
      ON CONFLICT (tenant_id) DO UPDATE
        SET monthly_micro_usd = EXCLUDED.monthly_micro_usd, monthly_tokens = EXCLUDED.monthly_tokens, updated_at = now()`;
  });

/**
 * Usage ledger over `usage.llm_calls` / `usage.tenant_budgets` (decision 0026): every
 * transaction is tenant-scoped (`withTenantTransaction`) and runs as `usage_runtime`.
 */
/**
 * Distinct users of a tenant's ledger rows since an instant (the staff overview's active users),
 * under the tenant's row level security like every other read here; rows without a user (service
 * calls) are skipped.
 */
export const listActiveUserIds = (sql: Sql) => (input: { readonly tenantId: string; readonly since: Date }): Promise<readonly string[]> =>
  withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
    await asRuntime(tx);
    const rows = await tx<{ user_id: string }[]>`
      SELECT DISTINCT user_id FROM usage.llm_calls
      WHERE tenant_id = ${input.tenantId} AND occurred_at >= ${input.since} AND user_id IS NOT NULL`;
    return rows.map((row) => row.user_id);
  });

type BucketRow = TotalsRow & { day: string; provider: string; model: string };

/**
 * A tenant's calls in `[from, to)` grouped by UTC day, provider and model (`/v1/admin/usage`,
 * decision 0044): one grouped read on `llm_calls_tenant_occurred_idx`, under the tenant's row
 * level security like every other read here.
 */
export const listUsageBuckets =
  (sql: Sql) =>
  (input: { readonly tenantId: string; readonly from: Date; readonly to: Date }): Promise<readonly (UsageTotals & { readonly day: string; readonly provider: string; readonly model: string })[]> =>
    withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const rows = await tx<BucketRow[]>`
        SELECT to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, provider, model, count(*) AS calls,
               coalesce(sum(input_tokens), 0) AS input_tokens, coalesce(sum(output_tokens), 0) AS output_tokens,
               coalesce(sum(cost_micro_usd), 0) AS cost_micro_usd, count(*) FILTER (WHERE cost_micro_usd IS NULL) AS unpriced_calls
        FROM usage.llm_calls
        WHERE tenant_id = ${input.tenantId} AND occurred_at >= ${input.from} AND occurred_at < ${input.to}
        GROUP BY 1, provider, model
        ORDER BY 1, provider, model`;
      return rows.map((row) => ({ day: row.day, provider: row.provider, model: row.model, ...toTotals(row) }));
    });

export const createPostgresUsageRepository = (sql: Sql): UsageRepository => ({
  insertCalls: insertCalls(sql),
  getMonthSpend: getMonthSpend(sql),
  getMonthByModel: getMonthByModel(sql),
  getTenantBudget: getTenantBudget(sql),
  setTenantBudget: setTenantBudget(sql),
});
