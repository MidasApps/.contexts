import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { PageQuerySchema } from "../http/envelopes.schema.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { AuditActionSchema } from "./audit-action.schema.ts";

const isOrderedWindow = (query: { occurredAfter?: string | undefined; occurredBefore?: string | undefined }): boolean =>
  query.occurredAfter === undefined || query.occurredBefore === undefined || query.occurredAfter < query.occurredBefore;

/** Filters of `GET /v1/organizations/{organizationId}/audit-logs` (newest first). */
export const AuditLogQuerySchema = PageQuerySchema.extend({
  action: AuditActionSchema.optional().meta(none("Only entries of this action.")),
  actorId: z.string().min(1).optional().meta(personal("Only entries by this actor id.")),
  occurredAfter: IsoDateTimeSchema.optional().meta(none("Only entries after this instant (UTC, exclusive).")),
  occurredBefore: IsoDateTimeSchema.optional().meta(none("Only entries before this instant (UTC, exclusive).")),
}).refine(isOrderedWindow, { error: "occurredAfter must be before occurredBefore.", path: ["occurredAfter"] });
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const AuditLogQueryContract = defineContract(AuditLogQuerySchema, {
  id: "audit.AuditLogQuery",
  kind: "query",
  description: "Filters and page of the organization audit log (core.audit-log.read).",
  examples: [{ action: "MEMBERSHIP_GRANTED", occurredAfter: "2026-09-01T00:00:00.000Z", limit: 50 }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.audit-log.read",
});

/** Filters of `GET /v1/admin/audit-logs`: the platform log, newest first (decision 0075). */
export const PlatformAuditLogQuerySchema = PageQuerySchema.extend({
  action: AuditActionSchema.optional().meta(none("Only entries of this action.")),
  organizationId: TenantIdSchema.optional().meta(none("Only entries whose staff action touched this organization.")),
});
export type PlatformAuditLogQuery = z.infer<typeof PlatformAuditLogQuerySchema>;

export const PlatformAuditLogQueryContract = defineContract(PlatformAuditLogQuerySchema, {
  id: "audit.PlatformAuditLogQuery",
  kind: "query",
  description: "Filters and page of the platform audit log (platform.audit-log.read).",
  examples: [{ action: "PLAN_DELETED", limit: 50 }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.audit-log.read",
});
