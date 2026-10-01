import { createHash } from "node:crypto";
import type { LlmCall, UsageDailyRollup } from "@core/contracts";
import type { UsageSink } from "../../application/ports/usage-sink.ts";

/** Canonical table of contracts/bigquery.md §14 (dataset `ai_observability`, partitioned by DATE(occurred_at)). */
export const LLM_CALLS_TABLE = "llm_calls";

/** `tabledata.insertAll` accepts at most 500 rows per request (BigQuery quota). */
export const BIGQUERY_INSERT_BATCH = 500;

/** One row of `ai_observability.llm_calls` (snake_case; money as INT64 micro-USD). */
export type BigQueryLlmCallRow = {
  readonly request_id: string | null;
  readonly occurred_at: string;
  readonly tenant_id: string;
  /** SHA-256 hex of the uid (bigquery.md §15 hashed derived column); the raw uid never leaves the ledger. */
  readonly user_id_hashed: string | null;
  readonly model: string;
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly cached_tokens: number;
  readonly cost_micro_usd: number | null;
  readonly latency_ms: number;
  readonly finish_reason: string | null;
  readonly tool_calls: readonly never[];
  readonly error: null;
  // Additive columns (bigquery.md §11): join keys back to the ledger and the traces.
  readonly llm_call_id: string;
  readonly trace_id: string | null;
  readonly agent_id: string;
  readonly provider: string;
};

/** One row of `ai_observability.daily_rollups` (SP5 Task 6; DDL in `infra/bigquery/ai_observability.sql`). */
export type BigQueryDailyRollupRow = {
  readonly tenant_id: string;
  readonly day: string;
  readonly model: string;
  readonly agent_id: string;
  readonly calls: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_micro_usd: number;
  readonly exported_at: string;
};

export const DAILY_ROLLUPS_TABLE = "daily_rollups";

/** The part of `@google-cloud/bigquery` `Table` the sink uses (a fake in tests). */
export type BigQueryTableLike<Row = BigQueryLlmCallRow> = {
  readonly insert: (
    rows: readonly { readonly insertId: string; readonly json: Row }[],
    options: { readonly raw: true; readonly skipInvalidRows: false; readonly ignoreUnknownValues: false },
  ) => Promise<unknown>;
};

/**
 * The warehouse joins and counts users by this value only. bigquery.md §15 (PII) wins
 * over the §14 `user_id` column: the uid is personal data (`LlmCall.userId`, pii personal).
 */
export const hashUserId = (userId: string | null): string | null => (userId === null ? null : createHash("sha256").update(userId).digest("hex"));

/** Ledger row → warehouse row. Tool calls and errors are not in the ledger yet: empty array and null. */
export const toBigQueryRow = (call: LlmCall): BigQueryLlmCallRow => ({
  request_id: call.requestId,
  occurred_at: call.occurredAt,
  tenant_id: call.tenantId,
  user_id_hashed: hashUserId(call.userId),
  model: call.model,
  prompt_tokens: call.inputTokens,
  completion_tokens: call.outputTokens,
  cached_tokens: call.cachedTokens,
  cost_micro_usd: call.costMicroUsd,
  latency_ms: call.latencyMs,
  finish_reason: call.finishReason,
  tool_calls: [],
  error: null,
  llm_call_id: call.id,
  trace_id: call.traceId,
  agent_id: call.agentId,
  provider: call.provider,
});

/** Rollup → warehouse row; no user column exists at this grain. */
export const toBigQueryRollupRow = (rollup: UsageDailyRollup, exportedAt: string): BigQueryDailyRollupRow => ({
  tenant_id: rollup.tenantId,
  day: rollup.day,
  model: rollup.model,
  agent_id: rollup.agentId,
  calls: rollup.calls,
  input_tokens: rollup.inputTokens,
  output_tokens: rollup.outputTokens,
  cost_micro_usd: rollup.costMicroUsd,
  exported_at: exportedAt,
});

/** A rollup's insertId is its content: an identical retry is dropped, a changed value is a new row. */
export const rollupInsertIdOf = (rollup: UsageDailyRollup): string =>
  createHash("sha256")
    .update([rollup.tenantId, rollup.day, rollup.model, rollup.agentId, rollup.calls, rollup.inputTokens, rollup.outputTokens, rollup.costMicroUsd].join("|"))
    .digest("hex");

const insertBatched = async <Row>(table: BigQueryTableLike<Row>, rows: readonly { readonly insertId: string; readonly json: Row }[]): Promise<void> => {
  for (let start = 0; start < rows.length; start += BIGQUERY_INSERT_BATCH) {
    await table.insert(rows.slice(start, start + BIGQUERY_INSERT_BATCH), { raw: true, skipInvalidRows: false, ignoreUnknownValues: false });
  }
};

/**
 * BigQuery adapter of `UsageSink` (outside `local`). `insertId` = ledger row id, so a
 * retried export is deduplicated by BigQuery's best-effort dedup and by the id column
 * downstream (bigquery.md §16: idempotency by id). Invalid rows fail the whole batch.
 */
export const createBigQueryUsageSink = (deps: {
  readonly table: BigQueryTableLike;
  /** `daily_rollups`; without it rollup exports are refused (a misconfiguration, never silent). */
  readonly rollupsTable?: BigQueryTableLike<BigQueryDailyRollupRow>;
  /** Test seam; defaults to the current time. */
  readonly now?: () => Date;
}): UsageSink => ({
  exportCalls: (calls) => insertBatched(deps.table, calls.map((call) => ({ insertId: call.id, json: toBigQueryRow(call) }))),
  exportRollups: async (rollups) => {
    if (deps.rollupsTable === undefined) throw new Error("daily_rollups table is not configured");
    const exportedAt = (deps.now ?? (() => new Date()))().toISOString();
    await insertBatched(deps.rollupsTable, rollups.map((rollup) => ({ insertId: rollupInsertIdOf(rollup), json: toBigQueryRollupRow(rollup, exportedAt) })));
  },
});

/**
 * The real `llm_calls` table through `@google-cloud/bigquery` (ADC on Cloud Run). The SDK
 * loads on the first export, so `local` (no-op sink) never imports it.
 */
export const createBigQueryLlmCallsTable = <Row = BigQueryLlmCallRow>(config: { readonly dataset: string; readonly projectId?: string; readonly table?: string }): BigQueryTableLike<Row> => {
  let table: Promise<BigQueryTableLike<Row>> | undefined;
  const load = async (): Promise<BigQueryTableLike<Row>> => {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery(config.projectId === undefined ? {} : { projectId: config.projectId });
    const target = client.dataset(config.dataset).table(config.table ?? LLM_CALLS_TABLE);
    return { insert: async (rows, options) => target.insert([...rows], options) };
  };
  return {
    insert: async (rows, options) => {
      table ??= load();
      return (await table).insert(rows, options);
    },
  };
};
