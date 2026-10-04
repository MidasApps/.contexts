import { createHash } from "node:crypto";
import { type LlmCall, LlmCallContract, LlmCallSchema, type UsageDailyRollup } from "@core/contracts";
import { describe, expect, it } from "vitest";
import {
  type BigQueryDailyRollupRow,
  type BigQueryTableLike,
  createBigQueryUsageSink,
  DAILY_ROLLUPS_TABLE,
  LLM_CALLS_TABLE,
} from "./bigquery-usage-sink.ts";
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

const callWithId = (index: number): LlmCall =>
  LlmCallSchema.parse({ ...example, id: `01928f6e-7b2a-7c3d-9e4f-${index.toString(16).padStart(12, "0")}` });

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
      user_id_hashed: createHash("sha256")
        .update(example.userId ?? "")
        .digest("hex"),
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

describe("bigquery usage sink: daily rollups", () => {
  const rollup: UsageDailyRollup = {
    tenantId: "OrgAaaaaaaaaaaaaaaaaa",
    day: "2026-09-30",
    model: "gemini-3.5-flash",
    agentId: "assistant",
    calls: 3,
    inputTokens: 300,
    outputTokens: 150,
    costMicroUsd: 6_000,
  } as UsageDailyRollup;

  const rollupTable = () => {
    const inserts: Parameters<BigQueryTableLike<BigQueryDailyRollupRow>["insert"]>[] = [];
    const table: BigQueryTableLike<BigQueryDailyRollupRow> = {
      insert: (rows, options) => {
        inserts.push([rows, options]);
        return Promise.resolve();
      },
    };
    return { table, inserts };
  };

  it("maps a rollup to the ai_observability.daily_rollups columns with its export time", async () => {
    const { table: rollupsTable, inserts } = rollupTable();
    const sink = createBigQueryUsageSink({
      table: fakeTable().table,
      rollupsTable,
      now: () => new Date("2026-09-30T12:15:00.000Z"),
    });
    await sink.exportRollups([rollup]);
    expect(DAILY_ROLLUPS_TABLE).toBe("daily_rollups");
    expect(inserts[0]?.[0][0]?.json).toEqual({
      tenant_id: rollup.tenantId,
      day: "2026-09-30",
      model: "gemini-3.5-flash",
      agent_id: "assistant",
      calls: 3,
      input_tokens: 300,
      output_tokens: 150,
      cost_micro_usd: 6_000,
      exported_at: "2026-09-30T12:15:00.000Z",
    });
  });

  it("deduplicates an identical rollup by content and sends a changed one as a new row", async () => {
    const { table: rollupsTable, inserts } = rollupTable();
    const sink = createBigQueryUsageSink({ table: fakeTable().table, rollupsTable });
    await sink.exportRollups([rollup, rollup, { ...rollup, calls: 4 }]);
    const [first, retry, changed] = inserts[0]?.[0].map((row) => row.insertId) ?? [];
    expect(first).toBe(retry);
    expect(changed).not.toBe(first);
  });

  it("refuses rollups when the table is not configured", async () => {
    await expect(createBigQueryUsageSink({ table: fakeTable().table }).exportRollups([rollup])).rejects.toThrow(
      "daily_rollups",
    );
  });
});

describe("noop usage sink", () => {
  it("logs the skipped row count and sends nothing", async () => {
    const lines: { message: string; fields: unknown }[] = [];
    const record = (message: string, fields?: unknown) => lines.push({ message, fields });
    await createNoopUsageSink({ debug: record, info: record, warn: record, error: record }).exportCalls([example]);
    expect(lines).toEqual([
      { message: "usage_export_skipped", fields: { rowCount: 1, sink: "none", table: "llm_calls" } },
    ]);
  });
});
