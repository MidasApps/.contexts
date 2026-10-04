import type { LlmCall } from "@core/contracts";
import { type AnyExportedSpan, SpanType, type TracingEvent, TracingEventType } from "@mastra/core/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ModelPrice, priceTableFor } from "../models/model-prices.ts";
import type { AgentRunRecord } from "../runtime/runtime-ports.ts";
import { createUsageLedgerExporter, LEDGER_FLUSH_MS, LEDGER_FLUSH_ROWS, type LedgerLogger } from "./usage-ledger-exporter.ts";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";

const generationSpan = (overrides: Partial<AnyExportedSpan> = {}, attributes: Record<string, unknown> = {}): AnyExportedSpan =>
  ({
    id: "span-1",
    traceId: TRACE_ID,
    name: "llm: gemini-3.5-flash",
    type: SpanType.MODEL_GENERATION,
    entityType: "agent",
    entityId: "knowledge",
    startTime: new Date("2026-09-30T10:00:00.000Z"),
    endTime: new Date("2026-09-30T10:00:01.250Z"),
    isEvent: false,
    isRootSpan: false,
    // A client-sent tracingOptions.metadata could put any tenant here: the ledger ignores it.
    metadata: { tenantId: "spoofed-tenant" },
    requestContext: { tenantId: "tenantA", userId: "uid-1", requestId: REQUEST_ID, principalKind: "user" },
    attributes: {
      provider: "google.generative-ai",
      model: "gemini-3.5-flash",
      finishReason: "stop",
      usage: { inputTokens: 1000, outputTokens: 200, inputDetails: { cacheRead: 300 } },
      ...attributes,
    },
    ...overrides,
  }) as AnyExportedSpan;

/** An agent run span; `tripwireAbort` is what Mastra sets when a processor stopped the run. */
const agentRunSpan = (overrides: Partial<AnyExportedSpan> = {}, attributes: Record<string, unknown> = {}): AnyExportedSpan =>
  ({
    id: "run-1",
    traceId: TRACE_ID,
    name: "agent run: 'assistant'",
    type: SpanType.AGENT_RUN,
    entityType: "agent",
    entityId: "assistant",
    startTime: new Date("2026-09-30T10:00:00.000Z"),
    endTime: new Date("2026-09-30T10:00:02.000Z"),
    isEvent: false,
    isRootSpan: true,
    requestContext: { tenantId: "tenantA", userId: "uid-1", requestId: REQUEST_ID, principalKind: "user" },
    attributes,
    ...overrides,
  }) as AnyExportedSpan;

/** A span as a durable agent ends it: rebuilt, without the request-context snapshot. */
const withoutContext = (span: AnyExportedSpan): AnyExportedSpan => {
  const rebuilt = { ...span };
  delete rebuilt.requestContext;
  return rebuilt;
};

const ended = (span: AnyExportedSpan): TracingEvent => ({ type: TracingEventType.SPAN_ENDED, exportedSpan: span });

const recordingLogger = () => {
  const lines: { level: string; message: string; fields: unknown }[] = [];
  const logger: LedgerLogger = {
    warn: (message, fields) => lines.push({ level: "warn", message, fields }),
    error: (message, fields) => lines.push({ level: "error", message, fields }),
  };
  return { logger, lines };
};

const setup = (recordLlmCalls: (calls: readonly LlmCall[]) => Promise<void> = () => Promise.resolve(), extra: { prices?: Readonly<Record<string, ModelPrice>> } = {}) => {
  const batches: LlmCall[][] = [];
  const runBatches: AgentRunRecord[][] = [];
  const { logger, lines } = recordingLogger();
  let sequence = 0;
  const exporter = createUsageLedgerExporter({
    usage: {
      recordLlmCalls: async (calls) => {
        batches.push([...calls]);
        await recordLlmCalls(calls);
      },
      recordAgentRuns: (runs) => {
        runBatches.push([...runs]);
        return Promise.resolve();
      },
    },
    logger,
    newId: () => `01928f6e-7b2a-7c3d-9e4f-${(sequence++).toString(16).padStart(12, "0")}`,
    ...extra,
  });
  return { exporter, batches, runBatches, lines };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usage ledger exporter", () => {
  it("turns an ended model generation span into a ledger row with its cost", async () => {
    const { exporter, batches } = setup();
    await exporter.exportTracingEvent(ended(generationSpan()));
    await exporter.flush();
    expect(batches).toEqual([
      [
        {
          id: "01928f6e-7b2a-7c3d-9e4f-000000000000",
          requestId: REQUEST_ID,
          traceId: TRACE_ID,
          tenantId: "tenantA",
          userId: "uid-1",
          agentId: "knowledge",
          provider: "google",
          model: "gemini-3.5-flash",
          inputTokens: 1000,
          outputTokens: 200,
          cachedTokens: 300,
          // 1000 × 1.5 + 200 × 9 micro-USD per token (1.5 / 9 USD per 1M tokens).
          costMicroUsd: 3300,
          latencyMs: 1250,
          finishReason: "stop",
          occurredAt: "2026-09-30T10:00:01.250Z",
        },
      ],
    ]);
  });

  it("stores a null cost and warns once per model when the price is unknown", async () => {
    const { exporter, batches, lines } = setup();
    const span = generationSpan({}, { provider: "fake", model: "fake-chat" });
    await exporter.exportTracingEvent(ended(span));
    await exporter.exportTracingEvent(ended(span));
    await exporter.flush();
    expect(batches[0]?.map((row) => row.costMicroUsd)).toEqual([null, null]);
    expect(lines).toEqual([{ level: "warn", message: "usage_price_missing", fields: { provider: "fake", model: "fake-chat" } }]);
  });

  it("prices the fake models with the nominal table of fake mode", async () => {
    const { exporter, batches, lines } = setup(undefined, { prices: priceTableFor("fake") });
    await exporter.exportTracingEvent(ended(generationSpan({}, { provider: "fake", model: "fake-chat" })));
    await exporter.flush();
    expect(batches[0]?.[0]?.costMicroUsd).toBeGreaterThan(0);
    expect(lines).toEqual([]);
  });

  it("ignores other span types and span starts", async () => {
    const { exporter, batches, runBatches } = setup();
    await exporter.exportTracingEvent(ended(generationSpan({ type: SpanType.TOOL_CALL })));
    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_STARTED, exportedSpan: agentRunSpan() });
    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_STARTED, exportedSpan: generationSpan() });
    await exporter.flush();
    expect(batches).toEqual([]);
    expect(runBatches).toEqual([]);
  });

  it("records every ended agent run, with the guardrail that stopped it (decision 0066)", async () => {
    const { exporter, runBatches, batches } = setup();
    const tripwireAbort = { reason: "Prompt injection detected.", processorId: "prompt-injection-detector" };
    await exporter.exportTracingEvent(ended(agentRunSpan({ id: "run-stopped" }, { tripwireAbort })));
    await exporter.exportTracingEvent(ended(agentRunSpan({ id: "run-ok", entityId: "knowledge", isRootSpan: false })));
    await exporter.flush();
    expect(batches).toEqual([]);
    expect(runBatches).toEqual([
      [
        {
          id: "01928f6e-7b2a-7c3d-9e4f-000000000000",
          requestId: REQUEST_ID,
          traceId: TRACE_ID,
          tenantId: "tenantA",
          userId: "uid-1",
          agentId: "assistant",
          tripwireProcessorId: "prompt-injection-detector",
          occurredAt: "2026-09-30T10:00:02.000Z",
        },
        expect.objectContaining({ agentId: "knowledge", tripwireProcessorId: null }),
      ],
    ]);
  });

  it("skips internal agent runs (the guardrail detectors' own agents) and runs without a tenant", async () => {
    const { exporter, runBatches, lines } = setup();
    await exporter.exportTracingEvent(ended(agentRunSpan({ entityId: "prompt-injection-detector", isInternal: true, isRootSpan: false })));
    await exporter.exportTracingEvent(ended(agentRunSpan({ requestContext: { userId: "uid-1" } })));
    await exporter.flush();
    expect(runBatches).toEqual([]);
    expect(lines).toEqual([{ level: "warn", message: "usage_span_without_tenant", fields: { agentId: "assistant" } }]);
  });

  it("uses the context of an agent run's own start when its end carries none (durable agents)", async () => {
    const { exporter, runBatches } = setup();
    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_STARTED, exportedSpan: agentRunSpan({ id: "run-durable" }) });
    await exporter.exportTracingEvent(ended(withoutContext(agentRunSpan({ id: "run-durable" }, { tripwireAbort: { processorId: "tenant-budget-guard" } }))));
    await exporter.flush();
    expect(runBatches.flat().map((run) => [run.tenantId, run.userId, run.tripwireProcessorId])).toEqual([["tenantA", "uid-1", "tenant-budget-guard"]]);
  });

  it("skips a span whose request context names no tenant, whatever its metadata says", async () => {
    const { exporter, batches, lines } = setup();
    await exporter.exportTracingEvent(ended(generationSpan({ requestContext: { userId: "uid-1" } })));
    await exporter.flush();
    expect(batches).toEqual([]);
    expect(lines).toEqual([{ level: "warn", message: "usage_span_without_tenant", fields: { agentId: "knowledge" } }]);
  });

  it("uses the context of the span's own start when the end carries none (durable agents)", async () => {
    const { exporter, batches, lines } = setup();
    const start = generationSpan({ id: "span-durable" });
    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_STARTED, exportedSpan: start });
    await exporter.exportTracingEvent(ended(withoutContext(generationSpan({ id: "span-durable", entityId: "assistant-chat" }))));
    await exporter.flush();
    expect(batches[0]?.map((row) => [row.tenantId, row.userId, row.requestId, row.agentId])).toEqual([["tenantA", "uid-1", REQUEST_ID, "assistant-chat"]]);
    expect(lines).toEqual([]);
  });

  it("never borrows the context of another span, and forgets a start once its end arrived", async () => {
    const { exporter, batches, lines } = setup();
    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_STARTED, exportedSpan: generationSpan({ id: "span-a" }) });
    await exporter.exportTracingEvent(ended(withoutContext(generationSpan({ id: "span-b" }))));
    await exporter.exportTracingEvent(ended(withoutContext(generationSpan({ id: "span-a" }))));
    await exporter.exportTracingEvent(ended(withoutContext(generationSpan({ id: "span-a" }))));
    await exporter.flush();
    expect(batches.flat()).toHaveLength(1);
    expect(lines.map((line) => line.message)).toEqual(["usage_span_without_tenant", "usage_span_without_tenant"]);
  });

  it("prefers the end event's own context over the one seen at start", async () => {
    const { exporter, batches } = setup();
    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_STARTED, exportedSpan: generationSpan({ requestContext: { tenantId: "tenantStart" } }) });
    await exporter.exportTracingEvent(ended(generationSpan()));
    await exporter.flush();
    expect(batches[0]?.[0]?.tenantId).toBe("tenantA");
  });

  it(`flushes as soon as ${LEDGER_FLUSH_ROWS} rows are buffered`, async () => {
    const { exporter, batches } = setup();
    for (let index = 0; index < LEDGER_FLUSH_ROWS; index += 1) await exporter.exportTracingEvent(ended(generationSpan()));
    await vi.advanceTimersByTimeAsync(0);
    expect(batches.map((batch) => batch.length)).toEqual([LEDGER_FLUSH_ROWS]);
  });

  it(`flushes a partial buffer within ${LEDGER_FLUSH_MS} ms`, async () => {
    const { exporter, batches } = setup();
    await exporter.exportTracingEvent(ended(generationSpan()));
    await vi.advanceTimersByTimeAsync(LEDGER_FLUSH_MS - 1);
    expect(batches).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(batches.map((batch) => batch.length)).toEqual([1]);
  });

  it("never throws into the agent when the ledger write fails, and retries the rows on the next flush", async () => {
    let fail = true;
    const { exporter, batches, lines } = setup(() => (fail ? Promise.reject(new Error("db down")) : Promise.resolve()));
    await exporter.exportTracingEvent(ended(generationSpan()));
    await expect(exporter.flush()).resolves.toBeUndefined();
    expect(lines).toEqual([{ level: "error", message: "usage_ledger_flush_failed", fields: { rowCount: 1, error: "db down" } }]);
    fail = false;
    await exporter.flush();
    expect(batches.map((batch) => batch.map((row) => row.id))).toEqual([["01928f6e-7b2a-7c3d-9e4f-000000000000"], ["01928f6e-7b2a-7c3d-9e4f-000000000000"]]);
  });

  it("flushes what is left on shutdown", async () => {
    const { exporter, batches } = setup();
    await exporter.exportTracingEvent(ended(generationSpan()));
    await exporter.shutdown();
    expect(batches.map((batch) => batch.length)).toEqual([1]);
  });
});
