// Test data factories of the `/admin` observability pages (traces, experiments, datasets).
import { IDS } from "./fixtures.ts";

type Json = Record<string, unknown>;

export const OBS_IDS = {
  trace: "4bf92f3577b34da6a3ce929d0e0e4736",
  otherTrace: "aaf92f3577b34da6a3ce929d0e0e4999",
  rootSpan: "00f067aa0ba902b7",
  modelSpan: "11f067aa0ba902b7",
  toolSpan: "22f067aa0ba902b7",
} as const;

export const buildTraceSummary = (overrides: Json = {}): Json => ({
  traceId: OBS_IDS.trace,
  tenantId: IDS.organization,
  name: "agent run: assistant",
  agentId: "assistant",
  workflowId: null,
  status: "ok",
  spanCount: 3,
  startedAt: "2026-09-30T12:00:00.000Z",
  durationMs: 2400,
  inputTokens: 1800,
  outputTokens: 350,
  costMicroUsd: 900,
  ...overrides,
});

export const buildSpan = (overrides: Json = {}): Json => ({
  spanId: OBS_IDS.rootSpan,
  parentSpanId: null,
  name: "agent run: assistant",
  type: "agent_run",
  status: "ok",
  model: null,
  input: null,
  output: null,
  startedAt: "2026-09-30T12:00:00.000Z",
  durationMs: 2400,
  inputTokens: 1800,
  outputTokens: 350,
  costMicroUsd: 900,
  ...overrides,
});

/** A trace with an agent root, a model generation and a tool call with redacted I/O. */
export const buildTraceDetail = (overrides: Json = {}): Json => ({
  summary: buildTraceSummary(),
  spans: [
    buildSpan(),
    buildSpan({ spanId: OBS_IDS.modelSpan, parentSpanId: OBS_IDS.rootSpan, name: "llm: gemini", type: "model_generation", model: "gemini-3.5-flash", durationMs: 1200, inputTokens: 1500, outputTokens: 300, costMicroUsd: 850 }),
    buildSpan({
      spanId: OBS_IDS.toolSpan,
      parentSpanId: OBS_IDS.rootSpan,
      name: "tool: searchKnowledge",
      type: "tool_call",
      status: "error",
      durationMs: 320,
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: null,
      input: { query: "refund policy" },
      output: { error: "TIMEOUT" },
    }),
  ],
  ...overrides,
});

/** `{ data, meta: { hasMore } }` of a console list paged by number. */
export const numberedPage = (items: readonly unknown[], hasMore = false): { status: number; body: unknown } => ({ status: 200, body: { data: items, meta: { hasMore } } });

export const buildExperiment = (overrides: Json = {}): Json => ({
  experimentId: "exp_01J8Z3K4M5",
  datasetId: "assistant.v1",
  agentId: "assistant",
  promptVersionId: null,
  status: "completed",
  itemCount: 18,
  scores: [
    { scorer: "tool-routing", mean: 0.94, baseline: 0.9 },
    { scorer: "tenant-leak", mean: 1, baseline: 1 },
  ],
  verdict: "passed",
  startedAt: "2026-09-30T12:00:00.000Z",
  finishedAt: "2026-09-30T12:03:00.000Z",
  ...overrides,
});

export const buildDataset = (overrides: Json = {}): Json => ({
  id: "ds_01J8Z3K4M5",
  name: "assistant.v1",
  tenantId: null,
  version: 3,
  targetIds: ["assistant"],
  createdAt: "2026-09-30T12:00:00.000Z",
  ...overrides,
});
