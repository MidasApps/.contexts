import type { AnyWorkflow } from "@mastra/core/workflows";

/**
 * How callers may use a workflow (SP5 spec §3.5, §3.6, decisions 0037 and 0040). Data only:
 * the Mastra routes of runs and schedules read it, never a client.
 * - `startable`: `/v1/workflows/{workflowId}/runs` may start it (`core.workflow-run.start`).
 * - `schedulable`: a tenant schedule may start it; its first step re-authorizes the creator.
 */
export type WorkflowPolicy = {
  readonly id: string;
  readonly startable: boolean;
  readonly schedulable: boolean;
};

/** A module's workflow and its policy (`defineAgentModule({ workflows })`). */
export type ModuleWorkflow = {
  readonly workflow: AnyWorkflow;
  readonly startable?: boolean;
  readonly schedulable?: boolean;
};

/** A workflow's id; Mastra types it `any` on `AnyWorkflow`. */
export const workflowIdOf = (workflow: AnyWorkflow): string => String(workflow.id);

export type WorkflowCatalog = {
  readonly get: (workflowId: string) => WorkflowPolicy | undefined;
  readonly ids: () => readonly string[];
};

export const createWorkflowCatalog = (policies: readonly WorkflowPolicy[]): WorkflowCatalog => {
  const byId = new Map(policies.map((policy) => [policy.id, policy] as const));
  return { get: (workflowId) => byId.get(workflowId), ids: () => [...byId.keys()] };
};

/** Policy of a registered workflow without flags: neither startable nor schedulable. */
export const policyOf = (id: string, flags: { startable?: boolean; schedulable?: boolean } = {}): WorkflowPolicy => ({
  id,
  startable: flags.startable ?? false,
  schedulable: flags.schedulable ?? false,
});
