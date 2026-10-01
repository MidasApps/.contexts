// Staff list and end of impersonation sessions (`/v1/admin/impersonation-sessions`, decision 0044).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { ImpersonationSessionIdSchema } from "../identity/ids.schema.ts";
import { AdminImpersonationSessionSchema } from "./admin-impersonation.schema.ts";

const STAFF = { 403: ["FORBIDDEN", "MFA_REQUIRED"] } as const;

export const adminListImpersonationSessionsEndpoint = defineEndpoint({
  id: "admin.listImpersonationSessions",
  method: "GET",
  path: "/v1/admin/impersonation-sessions",
  auth: "user",
  query: PageQuerySchema.extend({
    status: z.enum(["active"]).optional().meta(none("`active`: only sessions still open, soonest expiry first, in one page; without it, every session, newest first.")),
  }),
  responses: { 200: listEnvelope(AdminImpersonationSessionSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF },
  summary: "Lists impersonation sessions of every staff member, active or recent, with their status (staff, platform.user.read).",
});

export const adminEndImpersonationSessionEndpoint = defineEndpoint({
  id: "admin.endImpersonationSession",
  method: "POST",
  path: "/v1/admin/impersonation-sessions/{sessionId}/end",
  auth: "user",
  params: z.object({ sessionId: ImpersonationSessionIdSchema.meta(none("Impersonation session id.")) }),
  responses: { 204: null },
  errors: { ...STAFF, 404: ["NOT_FOUND"] },
  summary: "Ends any staff member's impersonation session early; idempotent (staff, platform.user.impersonate; audited on both logs with targetTenantId).",
});

export const ADMIN_IMPERSONATION_ENDPOINTS: readonly EndpointDefinition[] = [adminListImpersonationSessionsEndpoint, adminEndImpersonationSessionEndpoint];
