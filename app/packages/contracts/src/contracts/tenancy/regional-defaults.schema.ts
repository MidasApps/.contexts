import { z } from "zod";
import { none } from "../field-docs.ts";
import { LocaleSchema } from "../primitives/locale.schema.ts";
import { CurrencySchema } from "../primitives/money.schema.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";

/** Regional defaults of an organization (SP1 spec §4); every field is required. */
export const RegionalDefaultsSchema = z.object({
  locale: LocaleSchema.meta(none("Default BCP 47 locale when the user has no preference.")),
  timeZone: TimeZoneSchema.meta(none("Default IANA time zone; projects and units may override it.")),
  currency: CurrencySchema.meta(none("Default ISO 4217 currency for new amounts.")),
});
export type RegionalDefaults = z.infer<typeof RegionalDefaultsSchema>;

/** Overrides a project or unit may set; an absent field inherits from the parent node. */
export const NodeRegionalOverridesSchema = z.object({
  timeZone: TimeZoneSchema.optional().meta(none("IANA time zone of this node; absent inherits the parent's.")),
  currency: CurrencySchema.optional().meta(
    none("ISO 4217 currency for new amounts here; absent inherits the parent's."),
  ),
});
export type NodeRegionalOverrides = z.infer<typeof NodeRegionalOverridesSchema>;
