// Public API of the trace entity (SP5 Task 13): traces as staff read them, and the span tree.

// SP5 Task 14: the same traces as an organization reads its own (`/v1/traces`).
export {
  type TenantTraceFilters,
  tenantTraceKeys,
  tenantTraceQuery,
  tenantTracesQuery,
  useTenantTrace,
  useTenantTraces,
} from "./api/tenant-trace-queries.ts";
export {
  type AdminTraceFilters,
  adminTraceQuery,
  adminTracesQuery,
  TRACES_PAGE_SIZE,
  type TracePage,
  traceKeys,
  useAdminTrace,
  useAdminTraces,
} from "./api/trace-queries.ts";
export { buildSpanTree, hasSpanPayload, type SpanNode } from "./lib/span-tree.ts";
export { TraceCost, TraceDuration, TraceStatusPill, useFormatDuration } from "./ui/trace-metrics.tsx";
