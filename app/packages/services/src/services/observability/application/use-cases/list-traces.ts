import type { ConsoleGateway, PageNumber, TraceTimeRange } from "../ports/console-gateway.ts";
import { type TraceCostDeps, withLedgerCosts } from "./trace-costs.ts";

export type ListTraces = (
  query: {
    readonly tenantId: string | null;
    readonly agentId?: string;
    readonly status?: "ok" | "error";
  } & PageNumber &
    TraceTimeRange,
) => ReturnType<ConsoleGateway["listTraces"]>;

/**
 * Traces of one organization (tenant endpoints: always the caller's organization, whatever the
 * query asked) or of every tenant (`null`, staff). The runtime filters in storage and again per
 * trace; the cost of each trace comes from the usage ledger (decision 0044).
 */
export const makeListTraces =
  (deps: { readonly console: Pick<ConsoleGateway, "listTraces"> } & TraceCostDeps): ListTraces =>
  async (query) => {
    const listed = await deps.console.listTraces(query);
    if (!listed.ok) return listed;
    return {
      ok: true,
      data: { traces: await withLedgerCosts(deps, listed.data.traces), hasMore: listed.data.hasMore },
    };
  };
