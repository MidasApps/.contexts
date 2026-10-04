import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";

export const ApprovalRequestIdSchema = firestoreIdSchema<"ApprovalRequestId">();
export type ApprovalRequestId = z.infer<typeof ApprovalRequestIdSchema>;

export const APPROVAL_TTL_DAYS = 7;

/** pending → approved|rejected|cancelled|expired; approved → executed|failed (SP1 spec §6.5). */
export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "executed",
  "failed",
] as const;
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** Kind of an `ApprovalActionHandler` (kebab-case), e.g. `agent-command`. */
export const ApprovalActionKindSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, { error: "Expected a kebab-case kind." });

const ReasonSchema = z.string().trim().min(1).max(500);

const actionField = () =>
  z
    .strictObject({
      kind: ApprovalActionKindSchema.meta(none("Handler that validates and executes the action.")),
      input: z.record(z.string(), z.unknown()).meta(personal("Action input; the handler's schema validates it.")),
      summary: z.string().trim().min(1).max(500).meta(personal("Human-readable summary shown to approvers.")),
    })
    .meta(personal("The action to run once approved."));

export const ApprovalRequesterSchema = z.object({
  type: z.enum(["user", "device", "service"]).meta(none("Principal type of the requester.")),
  id: z.string().min(1).meta(personal("Uid, device id or API key id of the requester.")),
});

/** A stable SCREAMING_SNAKE code; free text (an SDK message, a host) never fits it. */
export const ApprovalFailureCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,63}$/, { error: "Expected a SCREAMING_SNAKE code." });

/**
 * The safe part of a failed execution (decision 0067): the handler's code, or a core code
 * (`APPROVAL_HANDLER_FAILED`, `UNKNOWN_APPROVAL_ACTION`, `EXECUTION_INTERRUPTED`), and the
 * request id that logged it. Never the error message or a stack (rule `error-handling`).
 */
export const ApprovalFailureSchema = z.strictObject({
  code: ApprovalFailureCodeSchema.meta(none("Why the approved action did not run.")),
  requestId: z.string().min(1).max(128).meta(none("Request id of the failed execution, for support.")),
});
export type ApprovalFailure = z.infer<typeof ApprovalFailureSchema>;

export const ApprovalRequestSchema = z.object({
  id: ApprovalRequestIdSchema.meta(none("Automatic id of the request.")),
  tenantId: TenantIdSchema.meta(none("Organization of the request.")),
  node: tenantNodeRefField("Node where the action runs; approvers need its permission there."),
  permission: PermissionSchema.meta(none("Permission of the action (one that requiresApproval).")),
  requestedBy: z.object(ApprovalRequesterSchema.shape).meta(personal("Who asked; never allowed to approve.")),
  action: actionField(),
  status: ApprovalStatusSchema.meta(none("Lifecycle state.")),
  decidedBy: UserIdSchema.nullable().meta(personal("Approver or rejecter; null while pending.")),
  reason: ReasonSchema.nullable().meta(personal("Reason given with the decision.")),
  expiresAt: IsoDateTimeSchema.meta(none("When a pending request expires (UTC), 7 days after creation.")),
  createdAt: IsoDateTimeSchema.meta(none("When the request was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the request last changed (UTC).")),
  // Optional: added after the first release (additive, schemas rule); only a `failed` request has it.
  failure: ApprovalFailureSchema.optional().meta(none("Why an approved action failed; absent otherwise.")),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

const NODE_EXAMPLE = { level: "project", tenantId: EXAMPLE_IDS.organization, projectId: EXAMPLE_IDS.project } as const;
const ACTION_EXAMPLE = {
  kind: "sample-delete-invoice",
  input: { invoiceId: "Iq2wE4rT6yU8iO0pA1sD" },
  summary: "Delete invoice 42",
};

export const ApprovalRequestContract = defineContract(ApprovalRequestSchema, {
  id: "access.ApprovalRequest",
  kind: "entity",
  description: "A four-eyes approval request for an action whose permission requires approval.",
  examples: [
    {
      id: EXAMPLE_IDS.approvalRequest,
      tenantId: EXAMPLE_IDS.organization,
      node: NODE_EXAMPLE,
      permission: "sample.invoice.delete",
      requestedBy: { type: "user", id: EXAMPLE_IDS.otherUser },
      action: ACTION_EXAMPLE,
      status: "pending",
      decidedBy: null,
      reason: null,
      expiresAt: EXAMPLE_TIMES.expires,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.approval.read",
});

export const CreateApprovalRequestInputSchema = z.strictObject({
  node: tenantNodeRefField("Node where the action will run."),
  permission: PermissionSchema.meta(none("Permission of the action; it must require approval.")),
  action: actionField(),
});
export type CreateApprovalRequestInput = z.infer<typeof CreateApprovalRequestInputSchema>;

export const CreateApprovalRequestInputContract = defineContract(CreateApprovalRequestInputSchema, {
  id: "access.CreateApprovalRequestInput",
  kind: "command",
  description: "Asks for approval of an action; the caller must hold its permission at the node.",
  examples: [{ node: NODE_EXAMPLE, permission: "sample.invoice.delete", action: ACTION_EXAMPLE }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});

export const DecideApprovalRequestInputSchema = z.strictObject({
  reason: ReasonSchema.optional().meta(personal("Optional reason, shown to the requester and audited.")),
});
export type DecideApprovalRequestInput = z.infer<typeof DecideApprovalRequestInputSchema>;

export const DecideApprovalRequestInputContract = defineContract(DecideApprovalRequestInputSchema, {
  id: "access.DecideApprovalRequestInput",
  kind: "command",
  description: "Approves or rejects a request (core.approval.decide plus the action's permission).",
  examples: [{}, { reason: "Confirmed with finance." }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.approval.decide",
});
