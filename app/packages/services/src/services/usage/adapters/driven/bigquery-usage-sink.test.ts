import { createHash } from "node:crypto";
import { type LlmCall, LlmCallContract, LlmCallSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { type BigQueryTableLike, createBigQueryUsageSink, LLM_CALLS_TABLE } from "./bigquery-usage-sink.ts";
import { createNoopUsageSink } from "./noop-usage-sink.ts";

const [example] = LlmCallContract.meta.examples as [LlmCall];

const fakeTable = () => {
  const inserts: Parameters<BigQueryTableLike["insert"]>[] = [];
  const table: BigQueryTableLike = {
    insert: (rows, options) => {
      inserts.push([rows, options]);
      return Promise.resolve();
    },
  };
  return { table, inserts };
};

const callWithId = (index: number): LlmCall => LlmCallSchema.parse({ ...example, id: `01928f6e-7b2a-7c3d-9e4f-${index.toString(16).padStart(12, "0")}` });

describe("bigquery usage sink", () => {
  it("maps ledger rows to the ai_observability.llm_calls columns", async () => {
    const { table, inserts } = fakeTable();
    await createBigQueryUsageSink({ table }).exportCalls([example]);
    const [[rows, options]] = inserts as [Parameters<BigQueryTableLike["insert"]>];
    expect(LLM_CALLS_TABLE).toBe("llm_calls");
    expect(options).toEqual({ raw: true, skipInvalidRows: false, ignoreUnknownValues: false });
    expect(rows[0]?.json).toEqual({
      request_id: example.requestId,
      occurred_at: example.occurredAt,
      tenant_id: example.tenantId,
      user_id_hashed: createHash("sha256").update(example.userId ?? "").digest("hex"),
      model: example.model,
      prompt_tokens: example.inputTokens,
      completion_tokens: example.outputTokens,
      cached_tokens: example.cachedTokens,
      cost_micro_usd: example.costMicroUsd,
      latency_ms: example.latencyMs,
      finish_reason: example.finishReason,
      tool_calls: [],
      error: null,
      llm_call_id: example.id,
      trace_id: example.traceId,
      agent_id: example.agentId,
      provider: example.provider,
    });
  });

  it("never exports the raw user id: only its SHA-256 (bigquery.md §15)", async () => {
    const { table, inserts } = fakeTable();
    const anonymous = LlmCallSchema.parse({ ...example, userId: null });
    await createBigQueryUsageSink({ table }).exportCalls([example, anonymous]);
    const [first, second] = inserts[0]?.[0] ?? [];
    expect(JSON.stringify(first?.json)).not.toContain(example.userId);
    expect(first?.json).not.toHaveProperty("user_id");
    expect(first?.json.user_id_hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(second?.json.user_id_hashed).toBeNull();
  });

  it("uses the ledger row id as insertId so a retried export deduplicates", async () => {
    const { table, inserts } = fakeTable();
    await createBigQueryUsageSink({ table }).exportCalls([callWithId(1), callWithId(2)]);
    expect(inserts[0]?.[0].map((row) => row.insertId)).toEqual([callWithId(1).id, callWithId(2).id]);
  });

  it("splits exports into insertAll batches of at most 500 rows", async () => {
    const { table, inserts } = fakeTable();
    await createBigQueryUsageSink({ table }).exportCalls(Array.from({ length: 501 }, (_, index) => callWithId(index)));
    expect(inserts.map(([rows]) => rows.length)).toEqual([500, 1]);
  });

  it("propagates an insert failure to the caller (the export workflow retries)", async () => {
    const table: BigQueryTableLike = { insert: () => Promise.reject(new Error("quota")) };
    await expect(createBigQueryUsageSink({ table }).exportCalls([example])).rejects.toThrow("quota");
  });
});

describe("noop usage sink", () => {
  it("logs the skipped row count and sends nothing", async () => {
    const lines: { message: string; fields: unknown }[] = [];
    const record = (message: string, fields?: unknown) => lines.push({ message, fields });
    await createNoopUsageSink({ debug: record, info: record, warn: record, error: record }).exportCalls([example]);
    expect(lines).toEqual([{ message: "usage_export_skipped", fields: { rowCount: 1, sink: "none" } }]);
  });
});
