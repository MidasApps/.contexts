import { createHash } from "node:crypto";
import type { AnyExportedSpan, ObservabilityExporter, TracingEvent } from "@mastra/core/observability";

/**
 * What leaves the process with a span (spec §13, rules/observability.md "sem PII"):
 * - `metadata.resourceId` (`tenantId:uid`, set by Mastra itself) becomes a hash, and
 *   `metadata.userId` is dropped (SP3 report task-7-8-12, concern 3);
 * - the request-context snapshot keeps only the span context keys (tenant, project,
 *   unit, request and conversation ids, principal kind, AI mode): the uid, the
 *   permissions and the principal never leave;
 * - prompts and answers (`input` / `output`) stay only where `keepPayloads` is set.
 * The usage ledger exporter reads the raw span in-process and is not wrapped.
 */

export type SpanExportPolicy = {
  /** Request-context keys that may be exported. */
  readonly contextKeys: readonly string[];
  /** Keep span input and output (prompts, answers, tool arguments). */
  readonly keepPayloads: boolean;
};

const RESOURCE_HASH_LENGTH = 16;

/** Stable pseudonym of a resource id: same user and tenant → same value, never the uid. */
export const hashResourceId = (resourceId: string): string =>
  `sha256:${createHash("sha256").update(resourceId).digest("hex").slice(0, RESOURCE_HASH_LENGTH)}`;

const scrubMetadata = (metadata: AnyExportedSpan["metadata"]): AnyExportedSpan["metadata"] => {
  if (metadata === undefined) return undefined;
  const rest = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "resourceId" && key !== "userId"));
  const resourceId: unknown = metadata["resourceId"];
  return typeof resourceId === "string" ? { ...rest, resourceId: hashResourceId(resourceId) } : rest;
};

const pickContext = (
  context: AnyExportedSpan["requestContext"],
  keys: readonly string[],
): AnyExportedSpan["requestContext"] => {
  if (context === undefined) return undefined;
  const kept = Object.fromEntries(keys.filter((key) => context[key] !== undefined).map((key) => [key, context[key]]));
  return Object.keys(kept).length === 0 ? undefined : kept;
};

/** A copy of the span as `policy` allows it out (the in-process span is not changed). */
export const scrubSpanForExport = (span: AnyExportedSpan, policy: SpanExportPolicy): AnyExportedSpan => {
  const copy = { ...span };
  if (!policy.keepPayloads) {
    delete copy.input;
    delete copy.output;
  }
  // Optional fields are left out rather than set to undefined (exactOptionalPropertyTypes).
  const metadata = scrubMetadata(span.metadata);
  if (metadata === undefined) delete copy.metadata;
  else copy.metadata = metadata;
  const requestContext = pickContext(span.requestContext, policy.contextKeys);
  if (requestContext === undefined) delete copy.requestContext;
  else copy.requestContext = requestContext;
  return copy;
};

/** Whether a trace is exported at `ratio`: decided by its id, so a trace is kept or dropped whole. */
export const isTraceSampled = (traceId: string, ratio: number): boolean => {
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  const bucket = Number.parseInt(createHash("sha256").update(traceId).digest("hex").slice(0, 8), 16) / 0x1_0000_0000;
  return bucket < ratio;
};

type ExporterEvents = Pick<
  ObservabilityExporter,
  "onLogEvent" | "onMetricEvent" | "onScoreEvent" | "onFeedbackEvent" | "onDroppedEvent"
>;

const forwardSignals = (inner: ObservabilityExporter): ExporterEvents => ({
  ...(inner.onLogEvent === undefined ? {} : { onLogEvent: (event) => inner.onLogEvent?.(event) }),
  ...(inner.onMetricEvent === undefined ? {} : { onMetricEvent: (event) => inner.onMetricEvent?.(event) }),
  ...(inner.onScoreEvent === undefined ? {} : { onScoreEvent: (event) => inner.onScoreEvent?.(event) }),
  ...(inner.onFeedbackEvent === undefined ? {} : { onFeedbackEvent: (event) => inner.onFeedbackEvent?.(event) }),
  ...(inner.onDroppedEvent === undefined ? {} : { onDroppedEvent: (event) => inner.onDroppedEvent?.(event) }),
});

/**
 * Per-exporter trace sampling: the observability instance samples `always` (the usage
 * ledger must see every model call), and this wrapper exports only a `ratio` of traces
 * to storage / OTLP. Logs, metrics and scores pass through unsampled.
 */
export const sampleTraces = (inner: ObservabilityExporter, ratio: number): ObservabilityExporter => {
  if (ratio >= 1) return inner;
  const tracing = (event: TracingEvent): void | Promise<void> => {
    if (!isTraceSampled(event.exportedSpan.traceId, ratio)) return undefined;
    return inner.onTracingEvent === undefined ? inner.exportTracingEvent(event) : inner.onTracingEvent(event);
  };
  return {
    name: inner.name,
    ...forwardSignals(inner),
    ...(inner.init === undefined ? {} : { init: (options) => inner.init?.(options) }),
    ...(inner.__setLogger === undefined ? {} : { __setLogger: (logger) => inner.__setLogger?.(logger) }),
    ...(inner.addScoreToTrace === undefined
      ? {}
      : { addScoreToTrace: (args) => inner.addScoreToTrace?.(args) ?? Promise.resolve() }),
    onTracingEvent: tracing,
    exportTracingEvent: async (event) => {
      await tracing(event);
    },
    flush: () => inner.flush(),
    shutdown: () => inner.shutdown(),
  };
};
