import type { ConsoleGateway } from "#/services/observability/application/ports/console-gateway.ts";

export type GetExperiment = (query: {
  readonly experimentId: string;
  readonly tenantId: string | null;
}) => ReturnType<ConsoleGateway["getExperiment"]>;

/**
 * One experiment by id (the comparison of two experiments on different list pages): an
 * organization's own, or any (`null`, staff). Another tenant's answers `NOT_FOUND`.
 */
export const makeGetExperiment =
  (deps: { readonly console: Pick<ConsoleGateway, "getExperiment"> }): GetExperiment =>
  (query) =>
    deps.console.getExperiment(query);
