import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { WorkflowRuntimeGateway } from "../ports/workflow-runtime-gateway.ts";

export type GetRun = (scope: AgentCallScope, runId: string) => ReturnType<WorkflowRuntimeGateway["getRun"]>;
export type GetRunEvents = (scope: AgentCallScope, runId: string) => ReturnType<WorkflowRuntimeGateway["getRunEvents"]>;

/** One run of the organization; another tenant's run is `NOT_FOUND`. */
export const makeGetRun =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "getRun"> }): GetRun =>
  (scope, runId) =>
    deps.gateway.getRun(scope, runId);

/** The run with its progress events (the SSE stream polls it). */
export const makeGetRunEvents =
  (deps: { readonly gateway: Pick<WorkflowRuntimeGateway, "getRunEvents"> }): GetRunEvents =>
  (scope, runId) =>
    deps.gateway.getRunEvents(scope, runId);
