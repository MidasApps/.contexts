import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type RunScheduleNow = (
  scope: AgentCallScope,
  scheduleId: string,
) => ReturnType<WorkflowRuntimeGateway["actOnSchedule"]>;

/** Queues a run of an own schedule now; its first step re-authorizes the creator. */
export const makeRunScheduleNow =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "actOnSchedule"> }): RunScheduleNow =>
  (scope, scheduleId) =>
    deps.gateway.actOnSchedule(scope, scheduleId, "run");
