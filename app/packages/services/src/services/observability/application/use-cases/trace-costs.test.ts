import { TraceSummarySchema, type TraceDetail, type TraceSummary } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { TraceCostReader, TraceLedgerCost } from "../ports/trace-cost-reader.ts";
import { makeGetTrace } from "./get-trace.ts";
import { makeListTraces } from "./list-traces.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const id = (seed: string): string => seed.repeat(32).slice(0, 32);

const trace = (seed: string, overrides: Record<string, unknown> = {}): TraceSummary =>
  TraceSummarySchema.parse({
    traceId: id(seed),
    tenantId: ORG_A,
    name: "agent run: assistant",
    agentId: "assistant",
    workflowId: null,
    status: "ok",
    spanCount: 2,
    startedAt: "2026-10-01T12:00:00.000Z",
    durationMs: 2000,
    inputTokens: 120,
    outputTokens: 30,
    costMicroUsd: null,
    ...overrides,
  });

const ledger = (rows: Record<string, Record<string, TraceLedgerCost>>) => {
  const reads: { tenantId: string; traceIds: readonly string[]; from: string; to: string }[] = [];
  const reader: TraceCostReader = {
    costByTrace: ({ tenantId, traceIds, from, to }) => {
      reads.push({ tenantId, traceIds, from: from.toISOString(), to: to.toISOString() });
      return Promise.resolve(new Map(Object.entries(rows[tenantId] ?? {}).filter(([traceId]) => traceIds.includes(traceId))));
    },
  };
  return { reader, reads };
};

const warnings: unknown[][] = [];
const logger = { warn: (...args: unknown[]) => void warnings.push(args) };
const listOf = (traces: TraceSummary[]) => ({ listTraces: () => Promise.resolve({ ok: true as const, data: { traces, hasMore: false } }) });

describe("trace costs from the usage ledger", () => {
  it("fills the cost of each trace with one ledger read per tenant, inside a time range around the page", async () => {
    const traces = [trace("a"), trace("b", { startedAt: "2026-10-01T13:00:00.000Z" }), trace("c", { tenantId: ORG_B }), trace("d", { tenantId: null })];
    const { reader, reads } = ledger({
      [ORG_A]: { [id("a")]: { costMicroUsd: 900, unpricedCalls: 0 }, [id("b")]: { costMicroUsd: 0, unpricedCalls: 0 } },
      [ORG_B]: { [id("c")]: { costMicroUsd: 41, unpricedCalls: 0 }, [id("a")]: { costMicroUsd: 7, unpricedCalls: 0 } },
    });
    const listed = await makeListTraces({ console: listOf(traces), costs: reader, logger })({ tenantId: null, page: 0, perPage: 20 });
    expect(listed.ok && listed.data.traces.map((row) => row.costMicroUsd)).toEqual([900, 0, 41, null]);
    expect(reads).toEqual([
      { tenantId: ORG_A, traceIds: [id("a"), id("b")], from: "2026-10-01T11:00:00.000Z", to: "2026-10-03T13:00:00.000Z" },
      { tenantId: ORG_B, traceIds: [id("c")], from: "2026-10-01T11:00:00.000Z", to: "2026-10-03T12:00:00.000Z" },
    ]);
  });

  it("keeps the cost unknown for a trace with an unpriced call or without ledger rows", async () => {
    const { reader } = ledger({ [ORG_A]: { [id("a")]: { costMicroUsd: 500, unpricedCalls: 1 } } });
    const listed = await makeListTraces({ console: listOf([trace("a"), trace("b")]), costs: reader, logger })({ tenantId: ORG_A, page: 0, perPage: 20 });
    expect(listed.ok && listed.data.traces.map((row) => row.costMicroUsd)).toEqual([null, null]);
  });

  it("still answers the traces when the ledger cannot be read, and logs it once without the ids", async () => {
    warnings.length = 0;
    const failing: TraceCostReader = { costByTrace: () => Promise.reject(new Error("connection refused")) };
    const listed = await makeListTraces({ console: listOf([trace("a"), trace("c", { tenantId: ORG_B })]), costs: failing, logger })({ tenantId: null, page: 0, perPage: 20 });
    expect(listed.ok && listed.data.traces.map((row) => row.costMicroUsd)).toEqual([null, null]);
    expect(warnings).toEqual([["trace_costs_unavailable", { err: expect.any(Error) as unknown, traceCount: 2 }]]);
  });

  it("passes an upstream failure through and reads no cost without a ledger", async () => {
    const down = { listTraces: () => Promise.resolve({ ok: false as const, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } }) };
    expect(await makeListTraces({ console: down, logger })({ tenantId: null, page: 0, perPage: 20 })).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    const plain = await makeListTraces({ console: listOf([trace("a")]), logger })({ tenantId: null, page: 0, perPage: 20 });
    expect(plain.ok && plain.data.traces[0]?.costMicroUsd).toBeNull();
  });

  it("fills the cost of one trace's summary and leaves the spans as they came", async () => {
    const detail: TraceDetail = { summary: trace("a"), spans: [] };
    const { reader } = ledger({ [ORG_A]: { [id("a")]: { costMicroUsd: 1234, unpricedCalls: 0 } } });
    const found = await makeGetTrace({ console: { getTrace: () => Promise.resolve({ ok: true, data: detail }) }, costs: reader, logger })({ traceId: id("a"), tenantId: null });
    expect(found.ok && found.data.summary.costMicroUsd).toBe(1234);
    expect(found.ok && found.data.spans).toEqual([]);
  });
});
