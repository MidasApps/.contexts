import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { nodeOfContext, readAgentContext } from "../context/agent-request-context.ts";
import type { AccessPort, AccessPrincipal, WorkflowApprovalPort, WorkflowCommandPort } from "../runtime/runtime-ports.ts";
import { createRequestHumanApprovalStep, HumanApprovalOutcomeSchema, REQUEST_HUMAN_APPROVAL_STEP_ID } from "./steps/request-human-approval.step.ts";

export const APPROVAL_DEMO_WORKFLOW_ID = "approval-demo";
/** Four-eyes permission of the demo action (`requiresApproval`, decision 0036). */
export const APPROVAL_DEMO_PERMISSION = "core.workflow-run.approve-demo";
/** Module command the demo applies once approved (SP3 Task 19 brings its executor). */
export const APPROVAL_DEMO_COMMAND_ID = "example.CreateNoteCommand";

export const ApprovalDemoInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(10_000).optional(),
});
export type ApprovalDemoInput = z.infer<typeof ApprovalDemoInputSchema>;

export const ApprovalDemoResultSchema = z.strictObject({
  outcome: z.enum(["applied", "rejected", "expired", "cancelled", "failed"]),
  approvalRequestId: z.string().nullable(),
  decidedBy: z.string().nullable(),
  /** Why the run did not apply: REQUESTER_MISMATCH, CONTEXT_MISSING or the command's refusal code. */
  code: z.string().nullable(),
});
export type ApprovalDemoResult = z.infer<typeof ApprovalDemoResultSchema>;

export type ApprovalDemoDeps = {
  readonly approvals: WorkflowApprovalPort;
  readonly commands: WorkflowCommandPort;
  readonly access: AccessPort;
  /** Defaults to `APPROVAL_DEMO_COMMAND_ID`. */
  readonly commandId?: string;
};

const ApprovedSchema = z.strictObject({ input: ApprovalDemoInputSchema, approval: HumanApprovalOutcomeSchema });

const collectInputStep = (deps: ApprovalDemoDeps) =>
  createStep({
    id: "collect-input",
    description: "Normalizes the note and checks that the requester may ask for the approval.",
    inputSchema: ApprovalDemoInputSchema,
    outputSchema: ApprovalDemoInputSchema,
    execute: async (params) => {
      const { inputData, requestContext } = params;
      const bail = (result: ApprovalDemoResult) => params.bail(result);
      const snapshot = readAgentContext(requestContext);
      if (!snapshot.ok) return bail({ outcome: "failed", approvalRequestId: null, decidedBy: null, code: "CONTEXT_MISSING" } satisfies ApprovalDemoResult);
      const { context, principal } = snapshot.data;
      const decision = await deps.access.authorize({ principal, permission: APPROVAL_DEMO_PERMISSION, node: nodeOfContext(context) });
      if (!decision.allowed) return bail({ outcome: "failed", approvalRequestId: null, decidedBy: null, code: "FORBIDDEN" } satisfies ApprovalDemoResult);
      return { title: inputData.title.trim(), ...(inputData.body === undefined ? {} : { body: inputData.body }) };
    },
  });

/** The principal as SP1 stores a requester (`requestedBy`): uid, device id or API key id. */
const requesterRefOf = (principal: AccessPrincipal): { type: string; id: string } => {
  if (principal.type === "user") return { type: "user", id: principal.uid };
  if (principal.type === "device") return { type: "device", id: principal.deviceId };
  return { type: "service", id: principal.apiKeyId };
};

const isRequester = (principal: AccessPrincipal, requestedBy: { type: string; id: string }): boolean => {
  const ref = requesterRefOf(principal);
  return ref.type === requestedBy.type && ref.id === requestedBy.id;
};

const applyStep = (deps: ApprovalDemoDeps) =>
  createStep({
    id: "apply",
    description: "Runs the command as the requester, once per run (idempotency key = run id).",
    inputSchema: ApprovedSchema,
    outputSchema: ApprovalDemoResultSchema,
    execute: async ({ inputData, requestContext, runId }) => {
      const { approval, input } = inputData;
      const base = { approvalRequestId: approval.approvalRequestId, decidedBy: approval.decidedBy };
      const snapshot = readAgentContext(requestContext);
      if (!snapshot.ok) return { outcome: "failed" as const, ...base, code: "CONTEXT_MISSING" };
      const { context, principal } = snapshot.data;
      // The restored context must be the requester's: a resume under another caller's context never acts.
      if (!isRequester(principal, approval.requestedBy)) return { outcome: "failed" as const, ...base, code: "REQUESTER_MISMATCH" };
      const result = await deps.commands.run({
        principal,
        tenantId: context.tenantId,
        node: nodeOfContext(context),
        commandId: deps.commandId ?? APPROVAL_DEMO_COMMAND_ID,
        input,
        idempotencyKey: runId,
        requestId: context.requestId,
      });
      return result.ok ? { outcome: "applied" as const, ...base, code: null } : { outcome: "failed" as const, ...base, code: result.code };
    },
  });

const recordStep = () =>
  createStep({
    id: "record",
    description: "Records a rejected, expired or cancelled request; nothing is applied.",
    inputSchema: ApprovedSchema,
    outputSchema: ApprovalDemoResultSchema,
    execute: ({ inputData }) => {
      const { approval } = inputData;
      const outcome = approval.decision === "approved" ? "failed" : approval.decision;
      return Promise.resolve({ outcome, approvalRequestId: approval.approvalRequestId, decidedBy: approval.decidedBy, code: null });
    },
  });

const finishStep = () =>
  createStep({
    id: "finish",
    description: "Returns the outcome of the branch that ran.",
    inputSchema: z.object({ apply: ApprovalDemoResultSchema.optional(), record: ApprovalDemoResultSchema.optional() }),
    outputSchema: ApprovalDemoResultSchema,
    execute: ({ inputData }) =>
      Promise.resolve(inputData.apply ?? inputData.record ?? { outcome: "failed" as const, approvalRequestId: null, decidedBy: null, code: "NO_BRANCH" }),
  });

/**
 * `approval-demo` (SP5 spec §3.2, decision 0036): `collect-input` → `requestHumanApproval` →
 * approved → `apply` (the note command as the requester) / otherwise → `record`. The generic
 * HITL workflow of the gate; modules build theirs with the same step.
 */
export const createApprovalDemoWorkflow = (deps: ApprovalDemoDeps) =>
  createWorkflow({
    id: APPROVAL_DEMO_WORKFLOW_ID,
    description: "Asks a second person to approve a note before it is created.",
    inputSchema: ApprovalDemoInputSchema,
    outputSchema: ApprovalDemoResultSchema,
  })
    .then(collectInputStep(deps))
    .then(
      createRequestHumanApprovalStep({
        approvals: deps.approvals,
        permission: APPROVAL_DEMO_PERMISSION,
        inputSchema: ApprovalDemoInputSchema,
        summarize: (input) => `Create the note "${input.title}"`,
      }),
    )
    .branch([
      [({ inputData }) => Promise.resolve(inputData.approval.decision === "approved"), applyStep(deps)],
      [({ inputData }) => Promise.resolve(inputData.approval.decision !== "approved"), recordStep()],
    ])
    .then(finishStep())
    .commit();

export { REQUEST_HUMAN_APPROVAL_STEP_ID };
