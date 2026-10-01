import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type CancelRun = (scope: AgentCallScope, runId: string) => ReturnType<WorkflowRuntimeGateway["cancelRun"]>;

/** Cancels a run of the organization (`core.workflow-run.cancel`, checked by `/v1` and the runtime). */
export const makeCancelRun =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "cancelRun"> }): CancelRun =>
  (scope, runId) =>
    deps.gateway.cancelRun(scope, runId);
