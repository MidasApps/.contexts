import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { LocaleSchema } from "../primitives/locale.schema.ts";
import { CurrencySchema } from "../primitives/money.schema.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";
import { ThemeSchema } from "./user-preferences.schema.ts";
import { DisplayNameSchema } from "./user.schema.ts";

const PreferencesPatchSchema = z
  .strictObject({
    locale: LocaleSchema.nullable().optional().meta(personal("New locale; null falls back to the organization default.")),
    timeZone: TimeZoneSchema.nullable().optional().meta(personal("New IANA time zone; null falls back to the node's.")),
    currency: CurrencySchema.nullable().optional().meta(personal("New display currency; null removes it.")),
    theme: ThemeSchema.optional().meta(none("New color theme.")),
    notifications: z
      .strictObject({ productUpdates: z.boolean().meta(none("Receive product update notices.")) })
      .optional()
      .meta(none("Notification opt-ins; security alerts cannot be turned off.")),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);

export const UpdateMeInputSchema = z
  .strictObject({
    displayName: DisplayNameSchema.optional().meta(personal("New display name.")),
    photoUrl: z.url().nullable().optional().meta(personal("New profile photo URL; null removes it.")),
    preferences: PreferencesPatchSchema.optional().meta(personal("Preference changes; absent keys keep their value.")),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;

export const UpdateMeInputContract = defineContract(UpdateMeInputSchema, {
  id: "identity.UpdateMeInput",
  kind: "command",
  description: "Changes the signed-in user's display name, photo or preferences (PATCH /v1/me).",
  examples: [{ displayName: "Ana S." }, { preferences: { timeZone: "America/Recife", theme: "dark" } }, { preferences: { locale: null } }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
