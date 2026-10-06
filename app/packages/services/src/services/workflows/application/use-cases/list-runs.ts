import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { ListRunsQuery, WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type ListRuns = (scope: AgentCallScope, query: ListRunsQuery) => ReturnType<WorkflowRuntimeGateway["listRuns"]>;

/** The organization's runs (tenant = `resourceId` prefix in the runtime, decision 0040). */
export const makeListRuns =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "listRuns"> }): ListRuns =>
  (scope, query) =>
    deps.gateway.listRuns(scope, query);
