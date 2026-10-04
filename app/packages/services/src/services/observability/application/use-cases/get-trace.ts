import type { ConsoleGateway } from "../ports/console-gateway.ts";
import { type TraceCostDeps, withLedgerCosts } from "./trace-costs.ts";

export type GetTrace = (query: {
  readonly traceId: string;
  readonly tenantId: string | null;
}) => ReturnType<ConsoleGateway["getTrace"]>;

/**
 * One trace with its spans; another tenant's trace reads as missing (404) for a tenant query. The
 * trace's cost comes from the usage ledger (decision 0044); the ledger has no span id, so the cost
 * of each span stays unknown.
 */
export const makeGetTrace =
  (deps: { readonly console: Pick<ConsoleGateway, "getTrace"> } & TraceCostDeps): GetTrace =>
  async (query) => {
    const found = await deps.console.getTrace(query);
    if (!found.ok) return found;
    const [summary] = await withLedgerCosts(deps, [found.data.summary]);
    return { ok: true, data: { ...found.data, summary: summary ?? found.data.summary } };
  };
