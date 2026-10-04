import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ScheduleWriteInput, WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type CreateSchedule = (
  scope: AgentCallScope,
  input: ScheduleWriteInput,
) => ReturnType<WorkflowRuntimeGateway["createSchedule"]>;

/** Creates a schedule as the caller. The runtime enforces the policy (5-field cron, IANA zone, minimum
 * interval, `schedulable`, the workflow's input schema) and stores the caller's context for re-authorization. */
export const makeCreateSchedule =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "createSchedule"> }): CreateSchedule =>
  (scope, input) =>
    deps.gateway.createSchedule(scope, input);
