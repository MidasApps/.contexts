import type { ConsoleGateway } from "../ports/console-gateway.ts";

export type GetTrace = (query: { readonly traceId: string; readonly tenantId: string | null }) => ReturnType<ConsoleGateway["getTrace"]>;

/** One trace with its spans; another tenant's trace reads as missing (404) for a tenant query. */
export const makeGetTrace =
  (deps: { readonly console: Pick<ConsoleGateway, "getTrace"> }): GetTrace =>
  (query) =>
    deps.console.getTrace(query);
