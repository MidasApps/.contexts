import type { TraceSummary } from "@core/contracts";
import type { Logger } from "../../../shared/observability/logger.ts";
import type { TraceCostReader } from "../ports/trace-cost-reader.ts";

export type TraceCostDeps = {
  /** Absent where no ledger is wired (unit tests of other concerns): costs stay as the runtime gave them. */
  readonly costs?: TraceCostReader;
  readonly logger: Pick<Logger, "warn">;
};

/** A model call may be recorded a little before its root span starts (clock skew between processes). */
const BEFORE_MS = 60 * 60_000;
/** A run suspended for an approval resumes later under the same trace; calls up to two days on still count. */
const AFTER_MS = 48 * 60 * 60_000;

const groupByTenant = (traces: readonly TraceSummary[]): Map<string, TraceSummary[]> => {
  const groups = new Map<string, TraceSummary[]>();
  for (const trace of traces) {
    if (trace.tenantId === null) continue;
    groups.set(trace.tenantId, [...(groups.get(trace.tenantId) ?? []), trace]);
  }
  return groups;
};

const costsOfTenant = async (reader: TraceCostReader, tenantId: string, traces: readonly TraceSummary[]): Promise<Map<string, number>> => {
  const starts = traces.map((trace) => Date.parse(trace.startedAt));
  const found = await reader.costByTrace({
    tenantId,
    traceIds: traces.map((trace) => trace.traceId),
    from: new Date(Math.min(...starts) - BEFORE_MS),
    to: new Date(Math.max(...starts) + AFTER_MS),
  });
  // A trace with an unpriced call has an unknown cost (the contract's `null`), never a partial sum.
  return new Map([...found].filter(([, cost]) => cost.unpricedCalls === 0).map(([traceId, cost]) => [traceId, cost.costMicroUsd]));
};

/**
 * Fills `costMicroUsd` of traces from the usage ledger (decision 0044): one ledger read per tenant
 * on the page, never one per trace. Platform traces (no tenant), traces without ledger rows and
 * traces with an unpriced call keep `null`. The ledger being unreachable never fails the trace
 * read: the costs stay `null` and the failure is logged once.
 */
export const withLedgerCosts = async (deps: TraceCostDeps, traces: readonly TraceSummary[]): Promise<TraceSummary[]> => {
  const reader = deps.costs;
  if (reader === undefined || traces.length === 0) return [...traces];
  try {
    const perTenant = await Promise.all([...groupByTenant(traces)].map(([tenantId, own]) => costsOfTenant(reader, tenantId, own)));
    const costs = new Map(perTenant.flatMap((map) => [...map]));
    return traces.map((trace) => ({ ...trace, costMicroUsd: costs.get(trace.traceId) ?? trace.costMicroUsd }));
  } catch (error: unknown) {
    deps.logger.warn("trace_costs_unavailable", { err: error, traceCount: traces.length });
    return [...traces];
  }
};
