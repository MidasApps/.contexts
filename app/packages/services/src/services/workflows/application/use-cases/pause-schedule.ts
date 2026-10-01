import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type PauseSchedule = (scope: AgentCallScope, scheduleId: string) => ReturnType<WorkflowRuntimeGateway["actOnSchedule"]>;

/** Pauses an own schedule. */
export const makePauseSchedule =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "actOnSchedule"> }): PauseSchedule =>
  (scope, scheduleId) =>
    deps.gateway.actOnSchedule(scope, scheduleId, "pause");
