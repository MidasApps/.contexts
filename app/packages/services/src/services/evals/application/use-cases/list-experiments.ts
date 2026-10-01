import type { ConsoleGateway, PageNumber } from "../../../observability/application/ports/console-gateway.ts";

export type ListExperiments = (query: { readonly tenantId: string | null } & PageNumber) => ReturnType<ConsoleGateway["listExperiments"]>;

/** An organization's experiments, or every one (`null`, staff: CI runs, prompt evals, tenant runs). */
export const makeListExperiments =
  (deps: { readonly console: Pick<ConsoleGateway, "listExperiments"> }): ListExperiments =>
  (query) =>
    deps.console.listExperiments(query);
