import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { LocaleSchema } from "../primitives/locale.schema.ts";
import { CurrencySchema } from "../primitives/money.schema.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";

export const ThemeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const NotificationPreferencesSchema = z.object({
  productUpdates: z.boolean().meta(none("Receive product update notices.")),
  securityAlerts: z.literal(true).meta(none("Security alerts are always on.")),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

/** Per-user preferences (SP1 spec §4); absent regional fields fall back to the organization. */
export const UserPreferencesSchema = z.object({
  locale: LocaleSchema.optional().meta(personal("Preferred BCP 47 locale; absent uses the organization default.")),
  timeZone: TimeZoneSchema.optional().meta(personal("Preferred IANA time zone for display; absent uses the node's.")),
  currency: CurrencySchema.optional().meta(personal("Preferred ISO 4217 currency for display.")),
  theme: ThemeSchema.meta(none("Color theme.")),
  notifications: z.object(NotificationPreferencesSchema.shape).meta(none("Notification opt-ins.")),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/** Preferences of a user doc created on the first `GET /v1/me`. */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "system",
  notifications: { productUpdates: false, securityAlerts: true },
};

export const UserPreferencesContract = defineContract(UserPreferencesSchema, {
  id: "identity.UserPreferences",
  kind: "settings",
  description: "Preferences of the signed-in user: locale, time zone, currency, theme and notifications.",
  examples: [
    {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      currency: "BRL",
      theme: "dark",
      notifications: { productUpdates: true, securityAlerts: true },
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
