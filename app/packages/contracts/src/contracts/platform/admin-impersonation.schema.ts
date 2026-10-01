import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { ImpersonationSessionSchema } from "../identity/impersonation-session.schema.ts";

/** `active` while open and unexpired; `ended` when staff closed it; `expired` when its time ran out. */
export const AdminImpersonationStatusSchema = z.enum(["active", "ended", "expired"]);
export type AdminImpersonationStatus = z.infer<typeof AdminImpersonationStatusSchema>;

/** An impersonation session as `/admin/users` lists it (decision 0044): the stored session plus its status now. */
export const AdminImpersonationSessionSchema = z.strictObject({
  ...ImpersonationSessionSchema.shape,
  status: AdminImpersonationStatusSchema.meta(none("`active`, `ended` or `expired`, at the time of the answer.")),
});
export type AdminImpersonationSession = z.infer<typeof AdminImpersonationSessionSchema>;

export const AdminImpersonationSessionContract = defineContract(AdminImpersonationSessionSchema, {
  id: "platform.AdminImpersonationSession",
  kind: "view",
  description: "A support access session for staff: who acted as whom, in which organization, why, and whether it is still open.",
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
      status: "active",
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.user.read",
});
