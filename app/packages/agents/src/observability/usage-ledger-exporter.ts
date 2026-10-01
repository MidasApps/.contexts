import { type LlmCall, LlmCallSchema } from "@core/contracts";
import { type AnyExportedSpan, type ObservabilityExporter, SpanType, type TracingEvent, TracingEventType } from "@mastra/core/observability";
import { estimateCostMicroUsd } from "../models/model-prices.ts";
import type { UsagePort } from "../runtime/runtime-ports.ts";
import { uuidv7 } from "./uuidv7.ts";

/**
 * Usage ledger exporter (SP3 spec §12, decision 0026): every ended
 * `MODEL_GENERATION` span becomes a `usage.llm_calls` row, written in batches
 * (≤ 2 s or 50 rows). It never throws into the agent: a failed write is logged
 * and the rows are retried with the next flush (bounded buffer).
 *
 * Tenant, user and request id come from the span's request-context snapshot,
 * which only the server middleware writes; span metadata is ignored for them,
 * because a caller's `tracingOptions.metadata` can override metadata keys.
 * The exporter sees every model call: it must be registered unsampled
 * (`create-observability.ts` samples only the export to storage and OTLP).
 *
 * A durable agent (the chat wrappers, decision 0031) ends its generation span from a rebuilt span
 * that carries no request context (`@mastra/core` 1.71.0), so the snapshot of the span's own start
 * event is kept by span id (server-generated) and used when the end has none.
 */

export const USAGE_LEDGER_EXPORTER_NAME = "usage-ledger";
export const LEDGER_FLUSH_ROWS = 50;
export const LEDGER_FLUSH_MS = 2000;
/** Rows kept while the ledger is unreachable; the oldest are dropped (and logged) beyond it. */
export const LEDGER_MAX_BUFFERED_ROWS = 1000;
/** Started generation spans whose context is remembered; the oldest are forgotten beyond it. */
export const LEDGER_MAX_OPEN_SPANS = 5000;

export type LedgerLogger = {
  readonly warn: (message: string, fields?: Record<string, unknown>) => void;
  readonly error: (message: string, fields?: Record<string, unknown>) => void;
};

export type UsageLedgerExporterOptions = {
  readonly usage: Pick<UsagePort, "recordLlmCalls">;
  /** Defaults to the logger Mastra hands every exporter (`__setLogger`). */
  readonly logger?: LedgerLogger;
  /** Row id seam for tests (uuidv7 by default). */
  readonly newId?: () => string;
};

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

const stringOf = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const countOf = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0);

// AI SDK provider ids carry the API flavour (`google.generative-ai`, `google.vertex.chat`); prices key on the vendor.
const vendorOf = (provider: string): string => provider.split(".")[0] ?? provider;

type GenerationAttributes = {
  provider?: unknown;
  model?: unknown;
  finishReason?: unknown;
  usage?: { inputTokens?: unknown; outputTokens?: unknown; inputDetails?: { cacheRead?: unknown } };
};

type RowParts = { readonly row: LlmCall; readonly priced: boolean } | { readonly row: null; readonly priced: false };

type SpanContext = Readonly<Record<string, unknown>>;

const toRow = (span: AnyExportedSpan, context: SpanContext, tenantId: string, id: string): RowParts => {
  const attributes = (span.attributes ?? {}) as GenerationAttributes;
  const provider = vendorOf(stringOf(attributes.provider) ?? "unknown");
  const model = stringOf(attributes.model) ?? "unknown";
  const inputTokens = countOf(attributes.usage?.inputTokens);
  const outputTokens = countOf(attributes.usage?.outputTokens);
  const costMicroUsd = estimateCostMicroUsd(`${provider}/${model}`, { inputTokens, outputTokens });
  const endTime = span.endTime ?? span.startTime;
  const parsed = LlmCallSchema.safeParse({
    id,
    requestId: stringOf(context["requestId"]),
    traceId: TRACE_ID_PATTERN.test(span.traceId) ? span.traceId : null,
    tenantId,
    userId: stringOf(context["userId"]),
    agentId: stringOf(span.entityId) ?? stringOf(span.entityName) ?? "unknown",
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedTokens: countOf(attributes.usage?.inputDetails?.cacheRead),
    costMicroUsd,
    latencyMs: Math.max(0, endTime.getTime() - span.startTime.getTime()),
    finishReason: stringOf(attributes.finishReason),
    occurredAt: endTime.toISOString(),
  });
  return parsed.success ? { row: parsed.data, priced: costMicroUsd !== null } : { row: null, priced: false };
};

const SILENT_LOGGER: LedgerLogger = { warn: () => undefined, error: () => undefined };

/**
 * @returns a Mastra `ObservabilityExporter`; register it next to the storage/OTLP exporters.
 */
export const createUsageLedgerExporter = (options: UsageLedgerExporterOptions): ObservabilityExporter => {
  let logger: LedgerLogger = options.logger ?? SILENT_LOGGER;
  const newId = options.newId ?? (() => uuidv7());
  const warnedModels = new Set<string>();
  let buffer: LlmCall[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing: Promise<void> = Promise.resolve();

  const writeBatch = async (rows: LlmCall[]): Promise<void> => {
    try {
      await options.usage.recordLlmCalls(rows);
    } catch (error: unknown) {
      logger.error("usage_ledger_flush_failed", { rowCount: rows.length, error: error instanceof Error ? error.message : String(error) });
      const kept = [...rows, ...buffer];
      if (kept.length > LEDGER_MAX_BUFFERED_ROWS) logger.error("usage_ledger_rows_dropped", { rowCount: kept.length - LEDGER_MAX_BUFFERED_ROWS });
      buffer = kept.slice(-LEDGER_MAX_BUFFERED_ROWS);
    }
  };

  // Flushes run one after another, so a retry never races a newer batch.
  const flush = (): Promise<void> => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    flushing = flushing.then(async () => {
      if (buffer.length === 0) return;
      const rows = buffer;
      buffer = [];
      await writeBatch(rows);
    });
    return flushing;
  };

  // Request context of started generation spans, by span id (insertion order = age).
  const started = new Map<string, SpanContext>();

  const remember = (span: AnyExportedSpan): void => {
    const context = span.requestContext;
    if (context === undefined || stringOf(context["tenantId"]) === null) return;
    started.set(span.id, context);
    if (started.size <= LEDGER_MAX_OPEN_SPANS) return;
    const oldest = started.keys().next();
    if (oldest.done !== true) started.delete(oldest.value);
  };

  /** The end event's own snapshot, else the one its start event carried. */
  const contextOf = (span: AnyExportedSpan): SpanContext => {
    const atStart = started.get(span.id);
    started.delete(span.id);
    return stringOf(span.requestContext?.["tenantId"]) === null ? (atStart ?? {}) : (span.requestContext ?? {});
  };

  const enqueue = (span: AnyExportedSpan): void => {
    const context = contextOf(span);
    const tenantId = stringOf(context["tenantId"]);
    if (tenantId === null) {
      logger.warn("usage_span_without_tenant", { agentId: span.entityId ?? null });
      return;
    }
    const { row, priced } = toRow(span, context, tenantId, newId());
    if (row === null) {
      logger.warn("usage_span_invalid", { agentId: span.entityId ?? null });
      return;
    }
    const modelKey = `${row.provider}/${row.model}`;
    if (!priced && !warnedModels.has(modelKey)) {
      warnedModels.add(modelKey);
      logger.warn("usage_price_missing", { provider: row.provider, model: row.model });
    }
    buffer.push(row);
    if (buffer.length >= LEDGER_FLUSH_ROWS) void flush();
    else timer ??= setTimeout(() => void flush(), LEDGER_FLUSH_MS);
  };

  return {
    name: USAGE_LEDGER_EXPORTER_NAME,
    __setLogger: (mastraLogger) => {
      if (options.logger === undefined) logger = mastraLogger;
    },
    exportTracingEvent: (event: TracingEvent) => {
      if (event.exportedSpan.type !== SpanType.MODEL_GENERATION) return Promise.resolve();
      if (event.type === TracingEventType.SPAN_STARTED) remember(event.exportedSpan);
      if (event.type === TracingEventType.SPAN_ENDED) enqueue(event.exportedSpan);
      return Promise.resolve();
    },
    flush,
    shutdown: flush,
  };
};
