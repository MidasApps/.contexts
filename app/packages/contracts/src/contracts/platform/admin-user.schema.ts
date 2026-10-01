import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { DisplayNameSchema, UserStatusSchema } from "../identity/user.schema.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** How `GET /v1/admin/users?query=` reads the text (decision 0044). */
export const AdminUserSearchBySchema = z.enum(["name", "email", "uid"]);
export type AdminUserSearchBy = z.infer<typeof AdminUserSearchBySchema>;

/** Most ids one `?ids=` lookup takes (one Firestore `getAll`). */
export const ADMIN_USER_LOOKUP_MAX = 100;

/** A user as platform staff find them (`/admin/users`, author and starter names in admin lists). */
export const AdminUserSummarySchema = z.strictObject({
  id: UserIdSchema.meta(personal("Firebase Auth uid.")),
  email: z.email().nullable().meta(personal("Email of the account; null when the profile has none yet.")),
  displayName: DisplayNameSchema.meta(personal("Name the user shows; may be empty.")),
  status: UserStatusSchema.meta(none("`active` or `disabled`.")),
  createdAt: IsoDateTimeSchema.nullable().meta(none("When the profile was created (UTC); null when unknown.")),
});
export type AdminUserSummary = z.infer<typeof AdminUserSummarySchema>;

export const AdminUserSummaryContract = defineContract(AdminUserSummarySchema, {
  id: "platform.AdminUserSummary",
  kind: "view",
  description: "A user for staff: id, email, name and status, as the user search and the batched name lookup return it.",
  examples: [{ id: EXAMPLE_IDS.user, email: "ana@example.com", displayName: "Ana Souza", status: "active", createdAt: EXAMPLE_TIMES.created }],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.user.read",
});
