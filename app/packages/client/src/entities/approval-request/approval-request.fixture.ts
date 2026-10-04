import { type ApprovalRequest, ApprovalRequestSchema } from "@core/contracts";

/** An SP1 approval request as the API returns it; override the action per test. */
export const buildApprovalRequest = (
  overrides: Partial<Record<keyof ApprovalRequest, unknown>> = {},
): ApprovalRequest =>
  ApprovalRequestSchema.parse({
    id: "Ap1qW2eR3tY4uI5oP6aS",
    tenantId: "OrgAaaaaaaaaaaaaaaaaa",
    node: { level: "organization", tenantId: "OrgAaaaaaaaaaaaaaaaaa" },
    permission: "core.workflow-run.approve-demo",
    requestedBy: { type: "user", id: "member-uid" },
    action: {
      kind: "workflow-resume",
      input: { workflowId: "approval-demo", runId: "run-1", stepId: "request-human-approval" },
      summary: 'Create the note "Follow-up"',
    },
    status: "pending",
    decidedBy: null,
    reason: null,
    expiresAt: "2026-10-07T12:00:00.000Z",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
    ...overrides,
  });
