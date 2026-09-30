import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_REQUEST_ID, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { tenantNodeRefField } from "../tenancy/node-ref.schema.ts";
import { AuditActionSchema } from "./audit-action.schema.ts";

export const AuditLogEntryIdSchema = firestoreIdSchema<"AuditLogEntryId">();
export type AuditLogEntryId = z.infer<typeof AuditLogEntryIdSchema>;

export const AuditActorTypeSchema = z.enum(["user", "device", "service", "system"]);
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;

/** A changed field name (`name`, `defaults.timeZone`); never a value. */
export const ChangedFieldSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/, {
  error: "Expected a field name or dotted path.",
});

export const AuditActorSchema = z.object({
  type: AuditActorTypeSchema.meta(none("Principal type, or `system` for automated writes.")),
  id: z.string().min(1).meta(personal("Uid, device id, API key id or `system`.")),
  onBehalfOf: UserIdSchema.optional().meta(personal("Staff uid when the actor was impersonated.")),
});

export const AuditTargetSchema = z.object({
  type: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .meta(none("Kind of the affected resource, kebab-case (`organization`, `api-key`).")),
  id: z.string().min(1).meta(personal("Id of the affected resource (may be a uid).")),
});

/**
 * Result of the audited attempt: `denied` records refused attempts, `failed` attempts that
 * errored, `pending-approval` actions waiting for a four-eyes decision (SP3 agent tools).
 */
export const AuditOutcomeSchema = z.enum(["success", "denied", "failed", "pending-approval"]);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

// Hex digests only (sha256 = 64 chars): never the hashed value itself.
const DigestSchema = z.string().regex(/^[a-f0-9]{16,128}$/, { error: "Expected a lower-case hex digest." });

/**
 * Machine facts an entry may carry besides its fields: an allowlist of keys with
 * constrained values (hashes, codes, ids, a duration), so no free text or personal data
 * fits. Unknown keys are refused, not stripped.
 */
export const AuditMetadataSchema = z.strictObject({
  inputHash: DigestSchema.optional().meta(none("Digest of the action input (never the input).")),
  fingerprint: DigestSchema.optional().meta(none("Digest identifying a repeated action (dedup, budgets).")),
  errorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/, { error: "Expected a SCREAMING_SNAKE error code." })
    .optional()
    .meta(none("Stable error code of a failed attempt.")),
  toolId: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/, { error: "Expected a tool id." })
    .optional()
    .meta(none("Id of the agent tool (`core.search`, `mcp:server/tool`).")),
  runId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "Expected a run id." })
    .optional()
    .meta(none("Id of the agent or workflow run.")),
  toolCallId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,200}$/, { error: "Expected a tool call id." })
    .optional()
    .meta(none("Id of the tool call an approval decision answers (SP4).")),
  durationMs: z.int().min(0).max(86_400_000).optional().meta(none("How long the attempt took, in milliseconds.")),
  endpointId: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}\.[a-z][A-Za-z0-9]{0,63}$/, { error: "Expected an endpoint id." })
    .optional()
    .meta(none("`/v1` endpoint id of an audited request (`tenancy.getOrganization`), e.g. under impersonation.")),
});
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;

/** Fields shared by tenant and platform entries; no email, token, secret or free text but `reason`. */
const ENTRY_FIELDS = {
  id: AuditLogEntryIdSchema.meta(none("Automatic id of the entry.")),
  occurredAt: IsoDateTimeSchema.meta(none("When the action happened (UTC).")),
  action: AuditActionSchema.meta(none("What happened, SCREAMING_SNAKE past tense.")),
  actor: z.object(AuditActorSchema.shape).meta(personal("Who did it.")),
  target: z.object(AuditTargetSchema.shape).meta(personal("What it was done to.")),
  node: tenantNodeRefField("Node the action happened at, when it has one.").optional(),
  outcome: AuditOutcomeSchema.meta(none("success, denied (refused), failed (errored) or pending-approval.")),
  requestId: z.string().min(1).meta(none("Request id (X-Request-Id) to correlate with logs.")),
  traceId: z.string().min(1).optional().meta(none("Trace id, when tracing is on.")),
  changes: z.array(ChangedFieldSchema).max(100).optional().meta(none("Names of the changed fields; never values.")),
  reason: z.string().trim().min(1).max(500).optional().meta(personal("Reason given by the actor (impersonation, approvals).")),
  metadata: AuditMetadataSchema.optional().meta(none("Allowlisted machine facts (hashes, codes, ids, duration); never free text.")),
};

/** Append-only tenant audit entry (`audit-logs`, SP1 spec §6.7). */
export const AuditLogEntrySchema = z.object({
  ...ENTRY_FIELDS,
  tenantId: TenantIdSchema.meta(none("Organization the entry belongs to.")),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/** Append-only platform audit entry (`platform-audit-logs`). */
export const PlatformAuditLogEntrySchema = z.object({
  ...ENTRY_FIELDS,
  targetTenantId: TenantIdSchema.optional().meta(none("Organization the staff action touched, when any.")),
});
export type PlatformAuditLogEntry = z.infer<typeof PlatformAuditLogEntrySchema>;

const ENTRY_EXAMPLE = {
  id: EXAMPLE_IDS.auditLogEntry,
  occurredAt: EXAMPLE_TIMES.updated,
  action: "ORGANIZATION_UPDATED",
  actor: { type: "user", id: EXAMPLE_IDS.user },
  target: { type: "organization", id: EXAMPLE_IDS.organization },
  node: { level: "organization", tenantId: EXAMPLE_IDS.organization },
  outcome: "success",
  requestId: EXAMPLE_REQUEST_ID,
};

export const AuditLogEntryContract = defineContract(AuditLogEntrySchema, {
  id: "audit.AuditLogEntry",
  kind: "entity",
  description: "An append-only audit record of an organization; lists changed field names, never values.",
  examples: [{ ...ENTRY_EXAMPLE, tenantId: EXAMPLE_IDS.organization, changes: ["name", "defaults.timeZone"] }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.audit-log.read",
});

export const PlatformAuditLogEntryContract = defineContract(PlatformAuditLogEntrySchema, {
  id: "audit.PlatformAuditLogEntry",
  kind: "entity",
  description: "An append-only audit record of platform staff actions (impersonation, staff grants).",
  examples: [
    {
      ...ENTRY_EXAMPLE,
      action: "IMPERSONATION_STARTED",
      actor: { type: "user", id: EXAMPLE_IDS.otherUser },
      target: { type: "user", id: EXAMPLE_IDS.user },
      reason: "Ticket 4821: user cannot see project Launch.",
      targetTenantId: EXAMPLE_IDS.organization,
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.audit-log.read",
});
