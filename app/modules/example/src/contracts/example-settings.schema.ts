import { defineContract, MoneySchema } from "@core/contracts";
import { z } from "zod";

/**
 * Settings of the example module, one record per organization (decision 0015 §6): the server
 * validates `PUT …/module-settings/example` with this schema and `SchemaForm` renders it from the
 * field `ui` meta (labels in the module namespace, `<labelKey>Hint` as help text).
 */
export const ExampleSettingsSchema = z.strictObject({
  greeting: z.string().min(1).max(80).meta({
    description: "Short greeting shown at the top of the module to every member of the organization.",
    pii: "none",
    ui: { widget: "text", labelKey: "example.settings.greeting", order: 1 },
    examples: ["Welcome to the example module"],
  }),
  defaultBudget: MoneySchema.meta({
    description: "Amount suggested for new items; currency defaults to the organization's regional currency in forms.",
    pii: "none",
    ui: { widget: "money", labelKey: "example.settings.defaultBudget", order: 2 },
    examples: [{ amountMinor: 150_000, currency: "BRL" }],
  }),
});
export type ExampleSettings = z.infer<typeof ExampleSettingsSchema>;

export const ExampleSettingsContract = defineContract(ExampleSettingsSchema, {
  id: "example.ExampleSettings",
  kind: "settings",
  description: "Organization-wide settings of the example module (reference module of the module contract).",
  examples: [{ greeting: "Welcome to the example module", defaultBudget: { amountMinor: 150_000, currency: "BRL" } }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "example.item.read",
});
