import { type ApprovalRequest, WorkflowResumeActionInputSchema } from "@core/contracts";
import { z } from "zod";
import type { Route } from "#/shared/lib/router/route-paths.ts";

/** Action kinds the inbox renders a preview for (SP3 `agent-command`, SP5 `workflow-resume`). */
export const AGENT_COMMAND_KIND = "agent-command";
export const WORKFLOW_RESUME_KIND = "workflow-resume";

/**
 * What an approver sees before deciding (SP5 spec §3.4):
 * - `agent-command`: the command and its before/after state, when the tool could preview it;
 * - `workflow-resume`: a link to the run's progress page;
 * - anything else (a module's kind): the summary only.
 */
export type ApprovalPreview =
  | {
      readonly kind: "agent-command";
      readonly commandId: string | null;
      readonly before: unknown;
      readonly after: unknown;
      readonly hasDiff: boolean;
    }
  | { readonly kind: "workflow-resume"; readonly workflowId: string; readonly runId: string; readonly runRoute: Route }
  | { readonly kind: "summary"; readonly summary: string };

const AgentCommandPreviewSchema = z.looseObject({
  commandId: z.string().min(1).optional(),
  preview: z.looseObject({ before: z.unknown(), after: z.unknown() }).nullable().optional(),
});

/** The run's progress page in the organization's settings: `/o/{organizationId}/settings/workflows/runs/{runId}`. */
export const workflowRunRoute = (organizationId: string, runId: string): Route => ({
  id: "settings",
  organizationId,
  section: "workflows",
  rest: `runs/${runId}`,
});

/** The stable page of one request: `/o/{organizationId}/settings/approvals/{approvalRequestId}` (the chat links here). */
export const approvalRequestRoute = (organizationId: string, approvalRequestId: string): Route => ({
  id: "settings",
  organizationId,
  section: "approvals",
  rest: approvalRequestId,
});

/**
 * The preview of a request from its stored action. Untrusted shapes fall back to the summary: the
 * inbox never fails to render a request because a handler stored something unexpected.
 */
export const approvalPreviewOf = (request: Pick<ApprovalRequest, "action" | "tenantId">): ApprovalPreview => {
  const { kind, input, summary } = request.action;
  if (kind === WORKFLOW_RESUME_KIND) {
    const parsed = WorkflowResumeActionInputSchema.safeParse(input);
    if (parsed.success) {
      return {
        kind: "workflow-resume",
        workflowId: parsed.data.workflowId,
        runId: parsed.data.runId,
        runRoute: workflowRunRoute(request.tenantId, parsed.data.runId),
      };
    }
  }
  if (kind === AGENT_COMMAND_KIND) {
    const parsed = AgentCommandPreviewSchema.safeParse(input);
    if (parsed.success) {
      const preview = parsed.data.preview ?? null;
      return {
        kind: "agent-command",
        commandId: parsed.data.commandId ?? null,
        before: preview?.before ?? null,
        after: preview?.after ?? null,
        hasDiff: preview !== null,
      };
    }
  }
  return { kind: "summary", summary };
};
