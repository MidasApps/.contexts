import { type TraceDetail, TraceDetailSchema, type TraceSpan, type TraceSummary, TraceSummarySchema } from "@core/contracts";
import { SENSITIVE_FIELDS } from "../observability/create-observability.ts";

/** The parts of a stored Mastra span the console reads (`mastra_ai_spans`, decision 0040). */
export type StoredSpan = {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | null;
  readonly name: string;
  readonly spanType: string;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly attributes?: Readonly<Record<string, unknown>> | null;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: unknown;
  readonly startedAt: Date;
  readonly endedAt?: Date | null;
};

/** The observability storage domain calls the reader makes (`storage.getStore("observability")`). */
export type TraceStore = {
  readonly listTraces: (args: {
    readonly filters?: Record<string, unknown>;
    readonly pagination?: { readonly page: number; readonly perPage: number };
  }) => Promise<{ readonly spans: readonly StoredSpan[]; readonly pagination?: { readonly hasMore: boolean } }>;
  readonly getTrace: (args: { readonly traceId: string }) => Promise<{ readonly spans: readonly StoredSpan[] } | null>;
};

const SENSITIVE = new Set(SENSITIVE_FIELDS.map((field) => field.toLowerCase().replace(/[-_]/g, "")));
// Same matching as `SensitiveDataFilter`: the whole key, case and separators ignored.
const isSensitiveKey = (key: string): boolean => SENSITIVE.has(key.toLowerCase().replace(/[-_]/g, ""));

/**
 * Span I/O after `SensitiveDataFilter` (decision 0040): every key named like a credential is
 * dropped again here, at any depth, so a span stored before a filter change never leaks one.
 */
export const dropSensitive = (value: unknown, depth = 0): unknown => {
  if (depth > 20 || value === null || typeof value !== "object") return value ?? null;
  if (Array.isArray(value)) return value.map((item) => dropSensitive(item, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !isSensitiveKey(key)).map(([key, item]) => [key, dropSensitive(item, depth + 1)]));
};

const tenantOf = (span: StoredSpan): string | null => {
  const tenant = span.metadata?.["tenantId"];
  return typeof tenant === "string" && tenant !== "" ? tenant : null;
};

const numberAt = (record: Readonly<Record<string, unknown>> | null | undefined, path: readonly string[]): number => {
  let current: unknown = record;
  for (const key of path) current = typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined;
  return typeof current === "number" && Number.isFinite(current) && current >= 0 ? Math.round(current) : 0;
};

const durationOf = (span: StoredSpan): number | null => (span.endedAt === undefined || span.endedAt === null ? null : Math.max(0, span.endedAt.getTime() - span.startedAt.getTime()));
const failed = (span: StoredSpan): boolean => span.error !== undefined && span.error !== null;
const truncate = (text: string): string => (text.length > 200 ? text.slice(0, 200) : text === "" ? "span" : text);

const toSpan = (span: StoredSpan): TraceSpan => ({
  spanId: span.spanId,
  parentSpanId: span.parentSpanId ?? null,
  name: truncate(span.name),
  type: span.spanType.slice(0, 60),
  status: failed(span) ? "error" : "ok",
  model: typeof span.attributes?.["model"] === "string" ? span.attributes["model"] : null,
  input: dropSensitive(span.input),
  output: dropSensitive(span.output),
  startedAt: span.startedAt.toISOString(),
  durationMs: durationOf(span),
  inputTokens: numberAt(span.attributes, ["usage", "inputTokens"]),
  outputTokens: numberAt(span.attributes, ["usage", "outputTokens"]),
  costMicroUsd: null,
});

/** One trace row from its spans (root first); `null` when it does not fit the contract (never a 500). */
export const summarizeTrace = (spans: readonly StoredSpan[]): TraceSummary | null => {
  const root = spans.find((span) => span.parentSpanId === undefined || span.parentSpanId === null) ?? spans[0];
  if (root === undefined) return null;
  const mapped = spans.map(toSpan);
  const parsed = TraceSummarySchema.safeParse({
    traceId: root.traceId,
    tenantId: tenantOf(root),
    name: truncate(root.name),
    agentId: root.entityType === "agent" ? (root.entityId ?? null) : null,
    workflowId: root.entityType === "workflow_run" ? (root.entityId ?? null) : null,
    status: spans.some(failed) ? "error" : "ok",
    spanCount: spans.length,
    startedAt: root.startedAt.toISOString(),
    durationMs: durationOf(root),
    inputTokens: mapped.reduce((sum, span) => sum + span.inputTokens, 0),
    outputTokens: mapped.reduce((sum, span) => sum + span.outputTokens, 0),
    costMicroUsd: null,
  });
  return parsed.success ? parsed.data : null;
};

export type TraceQuery = { readonly tenantId: string | null; readonly agentId?: string; readonly status?: "ok" | "error"; readonly page: number; readonly perPage: number };

/**
 * Traces for the console (decision 0040). A tenant query filters on the root span's
 * `metadata.tenantId` in storage and checks it again on every trace, so a tenant never sees
 * another tenant's trace whatever the storage filter does; `tenantId: null` (staff) sees all.
 */
export const createTraceReader = (store: TraceStore) => ({
  list: async (query: TraceQuery): Promise<{ readonly traces: TraceSummary[]; readonly hasMore: boolean }> => {
    const filters = {
      ...(query.tenantId === null ? {} : { metadata: { tenantId: query.tenantId } }),
      ...(query.agentId === undefined ? {} : { entityType: "agent", entityId: query.agentId }),
      ...(query.status === undefined ? {} : { status: query.status === "error" ? "error" : "success" }),
    };
    const listed = await store.listTraces({ filters, pagination: { page: query.page, perPage: query.perPage } });
    const roots = listed.spans.filter((span) => query.tenantId === null || tenantOf(span) === query.tenantId);
    const traces = await Promise.all(roots.map(async (root) => summarizeTrace((await store.getTrace({ traceId: root.traceId }))?.spans ?? [root])));
    return { traces: traces.filter((trace): trace is TraceSummary => trace !== null && (query.tenantId === null || trace.tenantId === query.tenantId)), hasMore: listed.pagination?.hasMore ?? false };
  },
  get: async (input: { readonly traceId: string; readonly tenantId: string | null }): Promise<TraceDetail | null> => {
    const trace = await store.getTrace({ traceId: input.traceId });
    if (trace === null) return null;
    const summary = summarizeTrace(trace.spans);
    if (summary === null || (input.tenantId !== null && summary.tenantId !== input.tenantId)) return null;
    const parsed = TraceDetailSchema.safeParse({ summary, spans: trace.spans.slice(0, 2000).map(toSpan) });
    return parsed.success ? parsed.data : null;
  },
});

export type TraceReader = ReturnType<typeof createTraceReader>;
