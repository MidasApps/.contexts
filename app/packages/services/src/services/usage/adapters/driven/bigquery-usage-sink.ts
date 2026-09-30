import type { LlmCall } from "@core/contracts";
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
  readonly user_id: string | null;
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

/** The part of `@google-cloud/bigquery` `Table` the sink uses (a fake in tests). */
export type BigQueryTableLike = {
  readonly insert: (
    rows: readonly { readonly insertId: string; readonly json: BigQueryLlmCallRow }[],
    options: { readonly raw: true; readonly skipInvalidRows: false; readonly ignoreUnknownValues: false },
  ) => Promise<unknown>;
};

/** Ledger row → warehouse row. Tool calls and errors are not in the ledger yet: empty array and null. */
export const toBigQueryRow = (call: LlmCall): BigQueryLlmCallRow => ({
  request_id: call.requestId,
  occurred_at: call.occurredAt,
  tenant_id: call.tenantId,
  user_id: call.userId,
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

/**
 * BigQuery adapter of `UsageSink` (outside `local`). `insertId` = ledger row id, so a
 * retried export is deduplicated by BigQuery's best-effort dedup and by the id column
 * downstream (bigquery.md §16: idempotency by id). Invalid rows fail the whole batch.
 */
export const createBigQueryUsageSink = (deps: { readonly table: BigQueryTableLike }): UsageSink => ({
  exportCalls: async (calls) => {
    for (let start = 0; start < calls.length; start += BIGQUERY_INSERT_BATCH) {
      const batch = calls.slice(start, start + BIGQUERY_INSERT_BATCH).map((call) => ({ insertId: call.id, json: toBigQueryRow(call) }));
      await deps.table.insert(batch, { raw: true, skipInvalidRows: false, ignoreUnknownValues: false });
    }
  },
});

/**
 * The real `llm_calls` table through `@google-cloud/bigquery` (ADC on Cloud Run). The SDK
 * loads on the first export, so `local` (no-op sink) never imports it.
 */
export const createBigQueryLlmCallsTable = (config: { readonly dataset: string; readonly projectId?: string }): BigQueryTableLike => {
  let table: Promise<BigQueryTableLike> | undefined;
  const load = async (): Promise<BigQueryTableLike> => {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery(config.projectId === undefined ? {} : { projectId: config.projectId });
    const target = client.dataset(config.dataset).table(LLM_CALLS_TABLE);
    return { insert: async (rows, options) => target.insert([...rows], options) };
  };
  return {
    insert: async (rows, options) => {
      table ??= load();
      return (await table).insert(rows, options);
    },
  };
};
