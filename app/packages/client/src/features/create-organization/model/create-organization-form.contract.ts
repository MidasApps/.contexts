import {
  type CreateOrganizationInput,
  CurrencySchema,
  defineContract,
  LocaleSchema,
  NodeNameSchema,
  TimeZoneSchema,
} from "@core/contracts";
import { isSupportedLocale, type SupportedLocale } from "@core/i18n";
import { z } from "zod";

const LABELS = "shell.organizations.create";

/**
 * The create-organization form (SchemaForm renders top-level fields only, so the API's
 * `defaults` object is flattened here and rebuilt by `toCreateOrganizationInput`). The API
 * validates `CreateOrganizationInputSchema` again (the client is UX, the server decides).
 */
export const CreateOrganizationFormSchema = z.object({
  name: NodeNameSchema.meta({
    description: "Name of the new organization.",
    pii: "none",
    ui: { labelKey: `${LABELS}.name`, order: 1 },
  }),
  locale: LocaleSchema.meta({
    description: "Default locale.",
    pii: "none",
    ui: { widget: "locale", labelKey: `${LABELS}.locale`, order: 2, group: `${LABELS}.regional` },
  }),
  timeZone: TimeZoneSchema.meta({
    description: "Default time zone.",
    pii: "none",
    ui: { widget: "timeZone", labelKey: `${LABELS}.timeZone`, order: 3, group: `${LABELS}.regional` },
  }),
  currency: CurrencySchema.meta({
    description: "Default currency.",
    pii: "none",
    ui: { widget: "currency", labelKey: `${LABELS}.currency`, order: 4, group: `${LABELS}.regional` },
  }),
});
export type CreateOrganizationForm = z.infer<typeof CreateOrganizationFormSchema>;

export const CreateOrganizationFormContract = defineContract(CreateOrganizationFormSchema, {
  id: "client.CreateOrganizationForm",
  kind: "command",
  description: "Client form behind POST /v1/organizations (regional defaults flattened for SchemaForm).",
  examples: [{ name: "Northwind", locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" }],
  pii: "none",
  tenancyScope: "user",
  relations: [],
});

export const toCreateOrganizationInput = (form: CreateOrganizationForm): CreateOrganizationInput => ({
  name: form.name,
  defaults: { locale: form.locale, timeZone: form.timeZone, currency: form.currency },
});

// A starting point only: the user picks the real currency in the form.
const CURRENCY_BY_LOCALE: Record<SupportedLocale, string> = { "pt-BR": "BRL", "en-US": "USD", "es-419": "USD" };

const browserTimeZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Prefilled defaults (SP2 Task 12): the UI locale, then the user's preferences, then the browser's
 * time zone and a currency usual for the locale.
 */
export const organizationFormDefaults = (args: {
  locale: string;
  preferences?: { timeZone?: string | undefined; currency?: string | undefined } | undefined;
}): Omit<CreateOrganizationForm, "name"> => {
  const locale = isSupportedLocale(args.locale) ? args.locale : "pt-BR";
  return {
    locale,
    timeZone: args.preferences?.timeZone ?? browserTimeZone(),
    currency: args.preferences?.currency ?? CURRENCY_BY_LOCALE[locale],
  };
};
