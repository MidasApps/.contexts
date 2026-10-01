import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type DeleteSchedule = (scope: AgentCallScope, scheduleId: string) => ReturnType<WorkflowRuntimeGateway["deleteSchedule"]>;

/** Deletes an own schedule. */
export const makeDeleteSchedule =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "deleteSchedule"> }): DeleteSchedule =>
  (scope, scheduleId) =>
    deps.gateway.deleteSchedule(scope, scheduleId);
