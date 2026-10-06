import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { SessionIdSchema } from "./ids.schema.ts";

export const SessionKindSchema = z.enum(["web", "desktop"]);
export type SessionKind = z.infer<typeof SessionKindSchema>;

/** A session as listed to its owner; never carries the cookie, secret or their hashes. */
export const SessionSummarySchema = z.object({
  id: SessionIdSchema.meta(none("Session id.")),
  kind: SessionKindSchema.meta(none("`web` (session cookie) or `desktop` (session secret).")),
  mfa: z.boolean().meta(none("Whether the sign-in that created the session used a second factor.")),
  userAgent: z.string().max(120).meta(personal("Browser and OS family only, e.g. `Firefox on Windows`.")),
  createdAt: IsoDateTimeSchema.meta(none("When the session was created (UTC).")),
  lastSeenAt: IsoDateTimeSchema.meta(none("Last exchange or request seen for the session (UTC).")),
  expiresAt: IsoDateTimeSchema.meta(none("When the session expires (UTC).")),
  current: z.boolean().meta(none("True for the session whose exchange minted the calling token.")),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionSummaryContract = defineContract(SessionSummarySchema, {
  id: "identity.SessionSummary",
  kind: "view",
  description: "An active web or desktop session of the signed-in user (GET /v1/me/sessions).",
  examples: [
    {
      id: EXAMPLE_IDS.session,
      kind: "web",
      mfa: true,
      userAgent: "Firefox on Windows",
      createdAt: EXAMPLE_TIMES.created,
      lastSeenAt: EXAMPLE_TIMES.updated,
      expiresAt: EXAMPLE_TIMES.expires,
      current: true,
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
