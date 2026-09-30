import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { OrganizationIdSchema, ProjectIdSchema, UnitIdSchema } from "../tenancy/ids.schema.ts";
import { UserPreferencesSchema } from "./user-preferences.schema.ts";

export const UserStatusSchema = z.enum(["active", "disabled"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const DisplayNameSchema = z.string().trim().max(120);

/** Last node the user worked in; the web restores it on sign-in. */
export const LastContextSchema = z.object({
  organizationId: OrganizationIdSchema.optional().meta(none("Active organization.")),
  projectId: ProjectIdSchema.optional().meta(none("Last project.")),
  unitId: UnitIdSchema.optional().meta(none("Last unit.")),
});
export type LastContext = z.infer<typeof LastContextSchema>;

/** Fields shared by the `users` entity and `Me`; each carries its own meta. */
export const USER_FIELDS = {
  email: z.email().meta(personal("Email address of the Firebase Auth account.")),
  displayName: DisplayNameSchema.meta(personal("Name shown to other members; may be empty.")),
  photoUrl: z.url().optional().meta(personal("Profile photo URL.")),
  preferences: z.object(UserPreferencesSchema.shape).meta(personal("Locale, time zone, currency, theme, notifications.")),
  lastContext: z.object(LastContextSchema.shape).meta(none("Last organization, project and unit used.")),
  accessVersion: z.int().min(0).meta(none("Bumped on every grant change; a newer value than the token's means stale claims.")),
};

export const UserSchema = z.object({
  id: UserIdSchema.meta(personal("Firebase Auth uid (document id).")),
  ...USER_FIELDS,
  status: UserStatusSchema.meta(none("`disabled` users hold no permission.")),
  createdAt: IsoDateTimeSchema.meta(none("When the user doc was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the user doc last changed (UTC).")),
});
export type User = z.infer<typeof UserSchema>;

export const UserContract = defineContract(UserSchema, {
  id: "identity.User",
  kind: "entity",
  description: "A user profile (`users/{uid}`), created on the first GET /v1/me.",
  examples: [
    {
      id: EXAMPLE_IDS.user,
      email: "ana@example.com",
      displayName: "Ana Souza",
      preferences: { theme: "system", notifications: { productUpdates: false, securityAlerts: true } },
      lastContext: { organizationId: EXAMPLE_IDS.organization },
      accessVersion: 3,
      status: "active",
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
