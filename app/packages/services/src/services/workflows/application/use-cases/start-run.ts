import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type StartRun = (
  scope: AgentCallScope,
  input: { readonly workflowId: string; readonly inputData: Readonly<Record<string, unknown>> },
) => ReturnType<WorkflowRuntimeGateway["startRun"]>;

/**
 * Starts a run as the caller. The runtime refuses a workflow that is not `startable`
 * (`WORKFLOW_NOT_STARTABLE`) and validates `inputData` with the workflow's own schema.
 */
export const makeStartRun =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "startRun"> }): StartRun =>
  (scope, input) =>
    deps.gateway.startRun(scope, input);
