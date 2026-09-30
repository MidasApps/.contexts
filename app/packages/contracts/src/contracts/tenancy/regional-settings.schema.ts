import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { LocaleSchema } from "../primitives/locale.schema.ts";
import { CurrencySchema } from "../primitives/money.schema.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";

/** Effective regional settings for one user at one node (SP1 spec §4, resolution order there). */
export const RegionalSettingsSchema = z.object({
  locale: LocaleSchema.meta(none("User preference, else the organization default.")),
  displayTimeZone: TimeZoneSchema.meta(none("Time zone to display dates in: user preference, else nodeTimeZone.")),
  nodeTimeZone: TimeZoneSchema.meta(none("Time zone of the node (unit, project, organization) for calendar rules.")),
  currency: CurrencySchema.meta(none("Default currency for new amounts at the node (unit, project, organization).")),
});
export type RegionalSettings = z.infer<typeof RegionalSettingsSchema>;

export const RegionalSettingsContract = defineContract(RegionalSettingsSchema, {
  id: "tenancy.RegionalSettings",
  kind: "view",
  description: "Locale, display time zone, node time zone and currency resolved for a user at a node.",
  examples: [{ locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Manaus", currency: "BRL" }],
  pii: "none",
  tenancyScope: "user",
  relations: [],
});
