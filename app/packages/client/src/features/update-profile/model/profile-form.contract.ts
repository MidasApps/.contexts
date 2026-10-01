import { defineContract, DisplayNameSchema } from "@core/contracts";
import { z } from "zod";

const LABELS = "profile.account.form";

/** The account form: the display name other members see (email comes from the sign-in account). */
export const ProfileFormSchema = z.object({
  displayName: DisplayNameSchema.meta({ description: "Name shown to other members.", pii: "personal", ui: { labelKey: `${LABELS}.displayName`, order: 1 } }),
});
export type ProfileForm = z.infer<typeof ProfileFormSchema>;

export const ProfileFormContract = defineContract(ProfileFormSchema, {
  id: "client.ProfileForm",
  kind: "command",
  description: "Client form behind PATCH /v1/me (display name).",
  examples: [{ displayName: "Ana Souza" }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
