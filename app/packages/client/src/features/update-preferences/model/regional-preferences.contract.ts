import { CurrencySchema, defineContract, LocaleSchema, type Me, TimeZoneSchema } from "@core/contracts";
import { isSupportedLocale, type SupportedLocale } from "@core/i18n";
import { z } from "zod";

const LABELS = "profile.preferences.regional";

/** Language, time zone and currency of the signed-in user (SP2 spec §8 profile/preferences). */
export const RegionalPreferencesFormSchema = z.object({
  locale: LocaleSchema.meta({
    description: "Interface language.",
    pii: "personal",
    ui: { widget: "locale", labelKey: `${LABELS}.locale`, order: 1 },
  }),
  timeZone: TimeZoneSchema.meta({
    description: "Time zone used to show dates.",
    pii: "personal",
    ui: { widget: "timeZone", labelKey: `${LABELS}.timeZone`, order: 2 },
  }),
  currency: CurrencySchema.meta({
    description: "Currency preferred for display.",
    pii: "personal",
    ui: { widget: "currency", labelKey: `${LABELS}.currency`, order: 3 },
  }),
});
export type RegionalPreferencesForm = z.infer<typeof RegionalPreferencesFormSchema>;

export const RegionalPreferencesFormContract = defineContract(RegionalPreferencesFormSchema, {
  id: "client.RegionalPreferencesForm",
  kind: "settings",
  description: "Client form behind PATCH /v1/me preferences (locale, time zone, currency).",
  examples: [{ locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});

const browserTimeZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Values the form starts with: the saved preferences, else what the user sees today (UI locale,
 * the display time zone, the currency of the current context).
 */
export const regionalFormDefaults = (
  me: Me,
  fallback: { locale: SupportedLocale; timeZone?: string | undefined; currency: string },
): RegionalPreferencesForm => ({
  locale:
    me.preferences.locale !== undefined && isSupportedLocale(me.preferences.locale)
      ? me.preferences.locale
      : fallback.locale,
  timeZone: me.preferences.timeZone ?? fallback.timeZone ?? browserTimeZone(),
  currency: me.preferences.currency ?? fallback.currency,
});

/** Only the fields that differ from what the form started with (`PATCH` semantics). */
export const changedPreferences = (
  initial: RegionalPreferencesForm,
  values: RegionalPreferencesForm,
): Partial<RegionalPreferencesForm> | null => {
  const changed: Partial<RegionalPreferencesForm> = {};
  if (values.locale !== initial.locale) changed.locale = values.locale;
  if (values.timeZone !== initial.timeZone) changed.timeZone = values.timeZone;
  if (values.currency !== initial.currency) changed.currency = values.currency;
  return Object.keys(changed).length === 0 ? null : changed;
};
