import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { ScheduleWriteInput, WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type UpdateSchedule = (
  scope: AgentCallScope,
  scheduleId: string,
  input: ScheduleWriteInput,
) => ReturnType<WorkflowRuntimeGateway["updateSchedule"]>;

/** Changes cron, zone or input of an own schedule; the policy is checked again on the merged values. */
export const makeUpdateSchedule =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "updateSchedule"> }): UpdateSchedule =>
  (scope, scheduleId, input) =>
    deps.gateway.updateSchedule(scope, scheduleId, input);
