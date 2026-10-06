import {
  CurrencySchema,
  defineContract,
  LocaleSchema,
  NodeNameSchema,
  type Organization,
  TimeZoneSchema,
  type UpdateOrganizationInput,
} from "@core/contracts";
import { z } from "zod";

const LABELS = "settings.general.form";

/**
 * The organization's name and regional defaults (SchemaForm renders top-level fields, so the API's
 * `defaults` object is flattened here and rebuilt by `changedOrganization`).
 */
export const OrganizationFormSchema = z.object({
  name: NodeNameSchema.meta({
    description: "Name of the organization.",
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
export type OrganizationForm = z.infer<typeof OrganizationFormSchema>;

export const OrganizationFormContract = defineContract(OrganizationFormSchema, {
  id: "client.OrganizationForm",
  kind: "settings",
  description: "Client form behind PATCH /v1/organizations/{organizationId} (defaults flattened).",
  examples: [{ name: "Northwind", locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});

export const organizationFormValues = (organization: Organization): OrganizationForm => ({
  name: organization.name,
  locale: organization.defaults.locale,
  timeZone: organization.defaults.timeZone,
  currency: organization.defaults.currency,
});

/** The `PATCH` body with only what changed (name and/or the changed defaults), or `null`. */
export const changedOrganization = (
  initial: OrganizationForm,
  values: OrganizationForm,
): UpdateOrganizationInput | null => {
  const defaults = Object.fromEntries(
    (["locale", "timeZone", "currency"] as const)
      .filter((key) => values[key] !== initial[key])
      .map((key) => [key, values[key]]),
  );
  const body = {
    ...(values.name === initial.name ? {} : { name: values.name }),
    ...(Object.keys(defaults).length === 0 ? {} : { defaults }),
  };
  return Object.keys(body).length === 0 ? null : body;
};
