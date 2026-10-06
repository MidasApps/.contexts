import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type ResumeSchedule = (
  scope: AgentCallScope,
  scheduleId: string,
) => ReturnType<WorkflowRuntimeGateway["actOnSchedule"]>;

/** Resumes an own schedule from now on (missed fires are not replayed). */
export const makeResumeSchedule =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "actOnSchedule"> }): ResumeSchedule =>
  (scope, scheduleId) =>
    deps.gateway.actOnSchedule(scope, scheduleId, "resume");
