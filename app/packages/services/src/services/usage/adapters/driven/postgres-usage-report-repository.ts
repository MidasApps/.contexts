import { type LlmCall, LlmCallSchema, type UsageDailyRollup, UsageDailyRollupSchema } from "@core/contracts";
import type { Sql, TransactionSql } from "postgres";
import { withTenantTransaction } from "../../../shared/postgres/with-tenant-transaction.ts";
import type { UsageReportRepository } from "../../application/ports/usage-report-repository.ts";
import { USAGE_RUNTIME_ROLE } from "./postgres-usage-repository.ts";

// Same role as the ledger (migrations 0007, 0009): the policies apply even to a superuser login.
const asRuntime = async (tx: TransactionSql): Promise<void> => {
  await tx.unsafe(`SET LOCAL ROLE ${USAGE_RUNTIME_ROLE}`);
};

type RollupRow = {
  tenant_id: string;
  day: string;
  model: string;
  agent_id: string;
  calls: string;
  input_tokens: string;
  output_tokens: string;
  cost_micro_usd: string;
};

const toRollup = (row: RollupRow): UsageDailyRollup =>
  UsageDailyRollupSchema.parse({
    tenantId: row.tenant_id,
    day: row.day,
    model: row.model,
    agentId: row.agent_id,
    calls: Number(row.calls),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costMicroUsd: Number(row.cost_micro_usd),
  });

// One statement per tenant and day set: the aggregate replaces the stored row, so a rerun is a no-op.
const upsertDailyRollups =
  (sql: Sql): UsageReportRepository["upsertDailyRollups"] =>
  (input) =>
    withTenantTransaction(sql, { tenantId: input.tenantId }, async (tx) => {
      await asRuntime(tx);
      if (input.days.length === 0) return [];
      // The index llm_calls_tenant_occurred_idx serves the range; the day list keeps only the asked days.
      const sorted = [...input.days].sort();
      const start = new Date(`${sorted[0] ?? ""}T00:00:00.000Z`);
      const end = new Date(Date.parse(`${sorted.at(-1) ?? ""}T00:00:00.000Z`) + 86_400_000);
      const rows = await tx<RollupRow[]>`
      INSERT INTO usage.daily_rollups (tenant_id, day, model, agent_id, calls, input_tokens, output_tokens, cost_micro_usd)
      SELECT tenant_id, (occurred_at AT TIME ZONE 'UTC')::date, model, agent_id, count(*),
             coalesce(sum(input_tokens), 0), coalesce(sum(output_tokens), 0), coalesce(sum(cost_micro_usd), 0)
      FROM usage.llm_calls
      WHERE tenant_id = ${input.tenantId}
        AND occurred_at >= ${start} AND occurred_at < ${end}
        AND (occurred_at AT TIME ZONE 'UTC')::date = ANY(${sorted}::date[])
      GROUP BY tenant_id, (occurred_at AT TIME ZONE 'UTC')::date, model, agent_id
      ON CONFLICT (tenant_id, day, model, agent_id) DO UPDATE
        SET calls = EXCLUDED.calls, input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
            cost_micro_usd = EXCLUDED.cost_micro_usd, updated_at = now()
      RETURNING tenant_id, day::text AS day, model, agent_id, calls, input_tokens, output_tokens, cost_micro_usd`;
      return rows
        .map(toRollup)
        .sort((a, b) => `${a.day}${a.model}${a.agentId}`.localeCompare(`${b.day}${b.model}${b.agentId}`));
    });

type CallRow = {
  id: string;
  request_id: string | null;
  trace_id: string | null;
  tenant_id: string;
  user_id: string | null;
  agent_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_micro_usd: string | null;
  latency_ms: number;
  finish_reason: string | null;
  occurred_at: Date;
};

const toCall = (row: CallRow): LlmCall =>
  LlmCallSchema.parse({
    id: row.id,
    requestId: row.request_id,
    traceId: row.trace_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    agentId: row.agent_id,
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    costMicroUsd: row.cost_micro_usd === null ? null : Number(row.cost_micro_usd),
    latencyMs: row.latency_ms,
    finishReason: row.finish_reason,
    occurredAt: row.occurred_at.toISOString(),
  });

const listCallsForExport =
  (sql: Sql): UsageReportRepository["listCallsForExport"] =>
  (input) =>
    withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const after = input.after ?? new Date(0);
      const key = input.page.afterKey;
      const rows = await tx<CallRow[]>`
      SELECT id, request_id, trace_id, tenant_id, user_id, agent_id, provider, model, input_tokens, output_tokens, cached_tokens,
             cost_micro_usd, latency_ms, finish_reason, occurred_at
      FROM usage.llm_calls
      WHERE tenant_id = ${input.tenantId} AND occurred_at > ${after} AND occurred_at <= ${input.until}
        ${key === null ? tx`` : tx`AND (occurred_at, id) > (${new Date(key.occurredAt)}, ${key.id}::uuid)`}
      ORDER BY occurred_at, id
      LIMIT ${input.page.limit}`;
      return rows.map(toCall);
    });

const getExportCursor =
  (sql: Sql): UsageReportRepository["getExportCursor"] =>
  (input) =>
    withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const [row] = await tx<
        { exported_until: Date }[]
      >`SELECT exported_until FROM usage.export_cursors WHERE tenant_id = ${input.tenantId}`;
      return row?.exported_until ?? null;
    });

const setExportCursor =
  (sql: Sql): UsageReportRepository["setExportCursor"] =>
  (input) =>
    withTenantTransaction(sql, { tenantId: input.tenantId }, async (tx) => {
      await asRuntime(tx);
      await tx`
      INSERT INTO usage.export_cursors (tenant_id, exported_until) VALUES (${input.tenantId}, ${input.exportedUntil})
      ON CONFLICT (tenant_id) DO UPDATE SET exported_until = GREATEST(usage.export_cursors.exported_until, EXCLUDED.exported_until), updated_at = now()`;
    });

const recordBudgetAlert =
  (sql: Sql): UsageReportRepository["recordBudgetAlert"] =>
  (input) =>
    withTenantTransaction(sql, { tenantId: input.tenantId }, async (tx) => {
      await asRuntime(tx);
      const inserted = await tx`
      INSERT INTO usage.budget_alerts (tenant_id, month, threshold_percent) VALUES (${input.tenantId}, ${input.month}::date, ${input.thresholdPercent})
      ON CONFLICT (tenant_id, month, threshold_percent) DO NOTHING RETURNING id`;
      return inserted.length === 1;
    });

/** `UsageReportRepository` over `usage.daily_rollups`, `usage.budget_alerts` and `usage.export_cursors` (migrations 0008, 0009). */
export const createPostgresUsageReportRepository = (sql: Sql): UsageReportRepository => ({
  upsertDailyRollups: upsertDailyRollups(sql),
  listCallsForExport: listCallsForExport(sql),
  getExportCursor: getExportCursor(sql),
  setExportCursor: setExportCursor(sql),
  recordBudgetAlert: recordBudgetAlert(sql),
});
