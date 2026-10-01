import type { ConsoleGateway, PageNumber } from "../ports/console-gateway.ts";

export type ListTraces = (query: { readonly tenantId: string | null; readonly agentId?: string; readonly status?: "ok" | "error" } & PageNumber) => ReturnType<ConsoleGateway["listTraces"]>;

/**
 * Traces of one organization (tenant endpoints: always the caller's organization, whatever the
 * query asked) or of every tenant (`null`, staff). The runtime filters in storage and again per trace.
 */
export const makeListTraces =
  (deps: { readonly console: Pick<ConsoleGateway, "listTraces"> }): ListTraces =>
  (query) =>
    deps.console.listTraces(query);
