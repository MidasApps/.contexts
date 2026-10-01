import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type ListSchedules = (scope: AgentCallScope) => ReturnType<WorkflowRuntimeGateway["listSchedules"]>;

/** The organization's schedules (tenant = `metadata.tenantId`, written only by the runtime). */
export const makeListSchedules =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "listSchedules"> }): ListSchedules =>
  (scope) =>
    deps.gateway.listSchedules(scope);
