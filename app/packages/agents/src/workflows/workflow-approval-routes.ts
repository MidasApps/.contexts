import type { Logger } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import type { WorkflowApprovalPort } from "../runtime/runtime-ports.ts";
import { settleWorkflowApproval } from "./settle-workflow-approval.ts";

/** Custom route outside the API prefix (decision 0036); the gateway's settler calls it. */
export const WORKFLOW_APPROVAL_SETTLE_PATH = "/workflow-approvals/:approvalRequestId/settle";

const APPROVAL_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID_HEADER = "x-request-id";

export type WorkflowApprovalRouteDeps = {
  readonly approvals: Pick<WorkflowApprovalPort, "getApprovalRequest">;
  readonly logger: Pick<Logger, "info" | "error">;
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const errorOf = (status: number, code: string, message: string, requestId: string | null): Response =>
  json(status, { error: { code, message, ...(requestId === null ? {} : { requestId }) } });

/**
 * `POST /workflow-approvals/:approvalRequestId/settle`: resumes the run of a settled SP1
 * request with the stored decision (`settleWorkflowApproval`). Reconcile-only, so it needs no
 * user Bearer; outside local Cloud Run IAM guards the whole runtime. 200 `{ data: { settled,
 * runStatus | reason } }`, 404 for an unknown request or workflow, 500 on infrastructure errors.
 */
export const handleSettleWorkflowApproval = async (input: {
  readonly mastra: Pick<Mastra, "getWorkflow">;
  readonly approvalRequestId: string;
  readonly requestId: string | null;
  readonly deps: WorkflowApprovalRouteDeps;
}): Promise<Response> => {
  const { approvalRequestId, requestId, deps } = input;
  const correlation = requestId === null ? {} : { requestId };
  if (!APPROVAL_REQUEST_ID.test(approvalRequestId)) return errorOf(404, "NOT_FOUND", "Approval request not found.", requestId);
  try {
    const result = await settleWorkflowApproval({ mastra: input.mastra, approvals: deps.approvals, approvalRequestId });
    if (!result.ok) return errorOf(404, "NOT_FOUND", "Approval request not found.", requestId);
    deps.logger.info("workflow_approval_settled", { ...correlation, approvalRequestId, ...result.data });
    return json(200, { data: result.data });
  } catch (error: unknown) {
    deps.logger.error("workflow_approval_settle_failed", { ...correlation, approvalRequestId, err: error });
    return errorOf(500, "INTERNAL_ERROR", "Internal error.", requestId);
  }
};

export const createWorkflowApprovalRoutes = (deps: WorkflowApprovalRouteDeps): ApiRoute[] => [
  registerApiRoute(WORKFLOW_APPROVAL_SETTLE_PATH, {
    method: "POST",
    requiresAuth: false,
    handler: (context) =>
      handleSettleWorkflowApproval({
        mastra: context.get("mastra"),
        approvalRequestId: context.req.param("approvalRequestId"),
        requestId: context.req.header(REQUEST_ID_HEADER) ?? null,
        deps,
      }),
  }),
];
