// Public API of the trace entity (SP5 Task 13): traces as staff read them, and the span tree.
export {
  adminTraceQuery,
  adminTracesQuery,
  traceKeys,
  TRACES_PAGE_SIZE,
  useAdminTrace,
  useAdminTraces,
  type AdminTraceFilters,
  type TracePage,
} from "./api/trace-queries.ts";
export { buildSpanTree, hasSpanPayload, type SpanNode } from "./lib/span-tree.ts";
export { TraceCost, TraceDuration, TraceStatusPill, useFormatDuration } from "./ui/trace-metrics.tsx";
