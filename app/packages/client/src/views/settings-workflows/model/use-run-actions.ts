"use client";

import type { AccessContext, WorkflowRun } from "@core/contracts";
import { isRunCancelable, useWorkflowCatalog } from "#/entities/workflow-run/index.ts";

/**
 * What the viewer can do with the run on screen: cancel it while it can still change, or run its
 * workflow again after a failure or a guardrail stop, when that workflow can still be started by hand.
 */
export const useRunActions = (context: AccessContext, current: WorkflowRun | null) => {
  const canCancel =
    context.permissions.includes("core.workflow-run.cancel") && current !== null && isRunCancelable(current.status);
  const canStart = context.permissions.includes("core.workflow-run.start");
  const catalog = useWorkflowCatalog(context.organization.id, { enabled: canStart });
  const workflows = catalog.data ?? [];
  const rerunWorkflowId =
    current !== null && current.failure !== undefined && current.failure !== null ? current.workflowId : null;
  const canRunAgain =
    canStart &&
    rerunWorkflowId !== null &&
    workflows.some((workflow) => workflow.id === rerunWorkflowId && workflow.startable);
  return { canCancel, canRunAgain, rerunWorkflowId, workflows };
};
