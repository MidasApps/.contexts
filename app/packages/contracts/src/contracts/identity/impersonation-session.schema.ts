import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal, sensitive } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { CustomTokenSchema } from "./desktop-session.schema.ts";
import { ImpersonationSessionIdSchema } from "./ids.schema.ts";

/** Longest impersonation (umbrella §16.2); `authorize()` enforces it through the session doc. */
export const MAX_IMPERSONATION_MINUTES = 60;

const ReasonSchema = z.string().trim().min(10).max(500);

export const ImpersonationSessionSchema = z.object({
  id: ImpersonationSessionIdSchema.meta(none("Impersonation session id (token claim `imp`).")),
  staffUid: UserIdSchema.meta(personal("Staff member acting as the user.")),
  targetUid: UserIdSchema.meta(personal("User being impersonated.")),
  tenantId: TenantIdSchema.meta(none("Only organization the session may read.")),
  reason: ReasonSchema.meta(personal("Why support needs the access; audited.")),
  expiresAt: IsoDateTimeSchema.meta(none("Hard end of the session (UTC), at most 60 minutes after start.")),
  endedAt: IsoDateTimeSchema.nullable().meta(none("When staff ended the session early (UTC); null while open.")),
  createdAt: IsoDateTimeSchema.meta(none("When the session started (UTC).")),
});
export type ImpersonationSession = z.infer<typeof ImpersonationSessionSchema>;

export const ImpersonationSessionContract = defineContract(ImpersonationSessionSchema, {
  id: "identity.ImpersonationSession",
  kind: "entity",
  description: "A read-only, time-boxed session in which platform staff acts as a user (SP1 spec §6.6).",
  examples: [
    {
      id: EXAMPLE_IDS.impersonationSession,
      staffUid: EXAMPLE_IDS.otherUser,
      targetUid: EXAMPLE_IDS.user,
      tenantId: EXAMPLE_IDS.organization,
      reason: "Ticket 4821: user cannot see project Launch.",
      expiresAt: "2026-09-29T15:30:00.000Z",
      endedAt: null,
      createdAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.user.impersonate",
});

export const StartImpersonationInputSchema = z.strictObject({
  targetUid: UserIdSchema.meta(personal("User to act as.")),
  organizationId: OrganizationIdSchema.meta(none("Organization of the user to read.")),
  reason: ReasonSchema.meta(personal("Why the access is needed (10-500 chars); audited.")),
  durationMinutes: z
    .int()
    .min(1)
    .max(MAX_IMPERSONATION_MINUTES)
    .default(MAX_IMPERSONATION_MINUTES)
    .meta(none("Session length in minutes, 1-60 (default 60).")),
});
export type StartImpersonationInput = z.infer<typeof StartImpersonationInputSchema>;

export const StartImpersonationInputContract = defineContract(StartImpersonationInputSchema, {
  id: "identity.StartImpersonationInput",
  kind: "command",
  description: "Starts read-only impersonation (platform.user.impersonate with MFA).",
  examples: [
    { targetUid: EXAMPLE_IDS.user, organizationId: EXAMPLE_IDS.organization, reason: "Ticket 4821: user cannot see project Launch.", durationMinutes: 30 },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.user.impersonate",
});

export const StartImpersonationResponseSchema = z.object({
  sessionId: ImpersonationSessionIdSchema.meta(none("Id of the new impersonation session.")),
  customToken: CustomTokenSchema.meta(sensitive("Custom token for the target user with claims `imp` and `impBy`.")),
  expiresAt: IsoDateTimeSchema.meta(none("Hard end of the session (UTC).")),
});
export type StartImpersonationResponse = z.infer<typeof StartImpersonationResponseSchema>;

export const StartImpersonationResponseContract = defineContract(StartImpersonationResponseSchema, {
  id: "identity.StartImpersonationResponse",
  kind: "view",
  description: "Answer of POST /v1/platform/impersonation-sessions with the one-time custom token.",
  examples: [
    { sessionId: EXAMPLE_IDS.impersonationSession, customToken: "eyJhbGciOiJSUzI1NiJ9.eyJpbXAiOiJJbTUifQ.c2ln", expiresAt: "2026-09-29T15:30:00.000Z" },
  ],
  pii: "sensitive",
  tenancyScope: "platform",
  relations: [],
});
