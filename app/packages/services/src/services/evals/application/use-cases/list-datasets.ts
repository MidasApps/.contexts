import type { ConsoleGateway } from "#/services/observability/application/ports/console-gateway.ts";

export type ListDatasets = (query: { readonly tenantId: string | null }) => ReturnType<ConsoleGateway["listDatasets"]>;

/** An organization's own datasets, or every dataset (`null`, staff). */
export const makeListDatasets =
  (deps: { readonly console: Pick<ConsoleGateway, "listDatasets"> }): ListDatasets =>
  (query) =>
    deps.console.listDatasets(query);
