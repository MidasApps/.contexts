// Audit `/v1` descriptors (SP1 spec §7.3, audit row).
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { listEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationParamsSchema } from "../tenancy/endpoints.ts";
import { AuditLogEntrySchema, PlatformAuditLogEntrySchema } from "./audit-log-entry.schema.ts";
import { AuditLogQuerySchema, PlatformAuditLogQuerySchema } from "./audit-log-query.schema.ts";

export const listAuditLogsEndpoint = defineEndpoint({
  id: "audit.listAuditLogs",
  method: "GET",
  path: "/v1/organizations/{organizationId}/audit-logs",
  auth: "user",
  params: OrganizationParamsSchema,
  query: AuditLogQuerySchema,
  responses: { 200: listEnvelope(AuditLogEntrySchema) },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Lists the audit log of an organization, newest first (core.audit-log.read).",
});

export const listPlatformAuditLogsEndpoint = defineEndpoint({
  id: "admin.listAuditLogs",
  method: "GET",
  path: "/v1/admin/audit-logs",
  auth: "user",
  query: PlatformAuditLogQuerySchema,
  responses: { 200: listEnvelope(PlatformAuditLogEntrySchema) },
  errors: { 403: ["FORBIDDEN", "MFA_REQUIRED"] },
  summary: "Lists the platform audit log, newest first (staff, platform.audit-log.read).",
});

export const AUDIT_ENDPOINTS: readonly EndpointDefinition[] = [listAuditLogsEndpoint, listPlatformAuditLogsEndpoint];
