import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it } from "vitest";
import { type EvalRunRecord, type ExperimentStore, getExperimentSummary, listExperimentSummaries, listFinishedSince, recordEvalRun } from "./eval-console.ts";
import { createTraceReader, dropSensitive, type TraceStore } from "./trace-reader.ts";

const TENANT_A = "TenantAaaaaaaaaaaaaaa";
const TENANT_B = "TenantBbbbbbbbbbbbbbb";
const hex = (seed: string, length: number) => seed.repeat(length).slice(0, length);

// A root agent run and one model generation per trace, in the real in-memory observability store.
const seedTrace = async (storage: InMemoryStore, args: { traceSeed: string; tenantId: string; secretInput?: unknown; startedAt?: string }) => {
  const observability = (await storage.getStore("observability")) as unknown as { createSpan: (args: { span: Record<string, unknown> }) => Promise<void> };
  const traceId = hex(args.traceSeed, 32);
  const startedAt = new Date(args.startedAt ?? "2026-10-01T12:00:00.000Z");
  const base = { traceId, isEvent: false, startedAt, endedAt: new Date(startedAt.getTime() + 2000), metadata: { tenantId: args.tenantId } };
  await observability.createSpan({ span: { ...base, spanId: hex(args.traceSeed, 16), parentSpanId: null, name: "agent run: assistant", spanType: "agent_run", entityType: "agent", entityId: "assistant", input: args.secretInput ?? null } });
  await observability.createSpan({
    span: { ...base, spanId: hex(`${args.traceSeed}1`, 16), parentSpanId: hex(args.traceSeed, 16), name: "llm: gemini", spanType: "model_generation", attributes: { model: "gemini-3.5-flash", usage: { inputTokens: 120, outputTokens: 30 } } },
  });
  return traceId;
};

const run = (overrides: Partial<EvalRunRecord> = {}): EvalRunRecord => ({
  agentId: "assistant",
  datasetName: "assistant.v1",
  datasetVersion: 1,
  itemCount: 18,
  scores: [{ scorer: "tool-routing", mean: 1, baseline: 1 }],
  verdict: "passed",
  source: "ci",
  promptVersionId: null,
  gitSha: "abc1234",
  startedAt: "2026-10-01T10:00:00.000Z",
  finishedAt: "2026-10-01T10:05:00.000Z",
  ...overrides,
});

describe("trace reader over Mastra observability storage (decision 0040)", () => {
  it("lists only the tenant's traces with tokens summed, and staff see every tenant", async () => {
    const storage = new InMemoryStore();
    const traceA = await seedTrace(storage, { traceSeed: "a", tenantId: TENANT_A });
    await seedTrace(storage, { traceSeed: "b", tenantId: TENANT_B });
    const reader = createTraceReader((await storage.getStore("observability")) as unknown as TraceStore);
    const own = await reader.list({ tenantId: TENANT_A, page: 0, perPage: 20 });
    expect(own.traces.map((trace) => [trace.traceId, trace.tenantId, trace.agentId, trace.spanCount, trace.inputTokens, trace.durationMs])).toEqual([[traceA, TENANT_A, "assistant", 2, 120, 2000]]);
    expect((await reader.list({ tenantId: null, page: 0, perPage: 20 })).traces).toHaveLength(2);
    expect(await reader.get({ traceId: traceA, tenantId: TENANT_B })).toBeNull();
    expect((await reader.get({ traceId: traceA, tenantId: TENANT_A }))?.spans.map((span) => span.type)).toEqual(["agent_run", "model_generation"]);
  });

  it("lists the traces that started in a time range: start inclusive, end exclusive", async () => {
    const storage = new InMemoryStore();
    const early = await seedTrace(storage, { traceSeed: "a", tenantId: TENANT_A, startedAt: "2026-09-29T10:00:00.000Z" });
    const middle = await seedTrace(storage, { traceSeed: "b", tenantId: TENANT_A, startedAt: "2026-09-30T10:00:00.000Z" });
    const late = await seedTrace(storage, { traceSeed: "c", tenantId: TENANT_B, startedAt: "2026-10-01T10:00:00.000Z" });
    const store = (await storage.getStore("observability")) as unknown as TraceStore;
    const ids = async (reader: ReturnType<typeof createTraceReader>, range: { startedAfter?: string; startedBefore?: string }) =>
      (
        await reader.list({
          tenantId: null,
          page: 0,
          perPage: 20,
          ...(range.startedAfter === undefined ? {} : { startedAfter: new Date(range.startedAfter) }),
          ...(range.startedBefore === undefined ? {} : { startedBefore: new Date(range.startedBefore) }),
        })
      ).traces
        .map((trace) => trace.traceId)
        .sort();
    const reader = createTraceReader(store);
    expect(await ids(reader, { startedAfter: "2026-09-30T10:00:00.000Z" })).toEqual([middle, late].sort());
    expect(await ids(reader, { startedBefore: "2026-09-30T10:00:00.000Z" })).toEqual([early]);
    expect(await ids(reader, { startedAfter: "2026-09-29T10:00:00.000Z", startedBefore: "2026-10-01T10:00:00.000Z" })).toEqual([early, middle].sort());
    // A store that ignores the range still never widens the answer.
    const ignoring: TraceStore = { listTraces: (args) => store.listTraces({ ...args, filters: {} }), getTrace: (args) => store.getTrace(args) };
    expect(await ids(createTraceReader(ignoring), { startedAfter: "2026-10-01T00:00:00.000Z" })).toEqual([late]);
  });

  it("never returns another tenant's trace even when the storage filter is ignored", async () => {
    const storage = new InMemoryStore();
    await seedTrace(storage, { traceSeed: "b", tenantId: TENANT_B });
    const real = (await storage.getStore("observability")) as unknown as TraceStore;
    const leaky: TraceStore = { listTraces: (args) => real.listTraces({ ...args, filters: {} }), getTrace: real.getTrace };
    expect((await createTraceReader(leaky).list({ tenantId: TENANT_A, page: 0, perPage: 20 })).traces).toEqual([]);
  });

  it("drops credential-named fields of span input and output at any depth", async () => {
    const storage = new InMemoryStore();
    const traceId = await seedTrace(storage, { traceSeed: "c", tenantId: TENANT_A, secretInput: { question: "hi", apiKey: "k", nested: [{ Authorization: "Bearer x", ok: 1 }] } });
    const detail = await createTraceReader((await storage.getStore("observability")) as unknown as TraceStore).get({ traceId, tenantId: TENANT_A });
    expect(detail?.spans[0]?.input).toEqual({ question: "hi", nested: [{ ok: 1 }] });
    expect(dropSensitive({ idToken: "t", text: "keep" })).toEqual({ text: "keep" });
  });
});

describe("eval runs as Mastra experiments (decision 0040)", () => {
  it("records CI and tenant runs, lists them per tenant and feeds the eval export", async () => {
    const storage = new InMemoryStore();
    const store = (await storage.getStore("experiments")) as unknown as ExperimentStore;
    const ci = await recordEvalRun(store, run(), null);
    const tenantRun = await recordEvalRun(store, run({ source: "prompt-eval", promptVersionId: "01928f6e-7b2a-7c3d-9e4f-000000000001", verdict: "failed" }), TENANT_A);
    const all = await listExperimentSummaries(store, { tenantId: null, page: 0, perPage: 20 });
    expect(all.experiments.map((experiment) => experiment.experimentId).sort()).toEqual([ci, tenantRun].sort());
    const own = await listExperimentSummaries(store, { tenantId: TENANT_A, page: 0, perPage: 20 });
    expect(own.experiments).toEqual([expect.objectContaining({ experimentId: tenantRun, verdict: "failed", status: "completed", agentId: "assistant", promptVersionId: "01928f6e-7b2a-7c3d-9e4f-000000000001" })]);
    expect((await listExperimentSummaries(store, { tenantId: TENANT_B, page: 0, perPage: 20 })).experiments).toEqual([]);
    expect((await listFinishedSince(store, "2026-10-01T10:04:00.000Z")).map((summary) => summary.scores)).toEqual([[{ scorer: "tool-routing", mean: 1, baseline: 1 }], [{ scorer: "tool-routing", mean: 1, baseline: 1 }]]);
    expect(await listFinishedSince(store, "2026-10-02T00:00:00.000Z")).toEqual([]);
  });

  it("reads one experiment by id: staff any, a tenant only its own", async () => {
    const storage = new InMemoryStore();
    const store = (await storage.getStore("experiments")) as unknown as ExperimentStore;
    const ci = await recordEvalRun(store, run(), null);
    const tenantRun = await recordEvalRun(store, run({ verdict: "failed" }), TENANT_A);
    expect(await getExperimentSummary(store, { experimentId: ci, tenantId: null })).toEqual(expect.objectContaining({ experimentId: ci, verdict: "passed" }));
    expect(await getExperimentSummary(store, { experimentId: tenantRun, tenantId: TENANT_A })).toEqual(expect.objectContaining({ experimentId: tenantRun, verdict: "failed" }));
    expect(await getExperimentSummary(store, { experimentId: tenantRun, tenantId: TENANT_B })).toBeNull();
    expect(await getExperimentSummary(store, { experimentId: ci, tenantId: TENANT_A })).toBeNull();
    expect(await getExperimentSummary(store, { experimentId: "missing", tenantId: null })).toBeNull();
  });

  it("never answers another tenant's experiment even when the store ignores the filter", async () => {
    const storage = new InMemoryStore();
    const real = (await storage.getStore("experiments")) as unknown as ExperimentStore;
    const other = await recordEvalRun(real, run(), TENANT_B);
    const leaky: Pick<ExperimentStore, "getExperimentById"> = { getExperimentById: (args) => real.getExperimentById({ id: args.id }) };
    expect(await getExperimentSummary(leaky, { experimentId: other, tenantId: TENANT_A })).toBeNull();
  });
});
