import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { ModuleIdSchema } from "./module-manifest.schema.ts";

/**
 * Values of a module's settings. The wire shape is generic because the core does not know the
 * modules: the server validates them with the module's `settings` contract and the client parses
 * them with the same contract (decision 0015 §6).
 */
export const ModuleSettingsValuesSchema = z.record(z.string(), z.unknown());
export type ModuleSettingsValues = z.infer<typeof ModuleSettingsValuesSchema>;

/** `GET|PUT /v1/organizations/{organizationId}/module-settings/{moduleId}` response. */
export const ModuleSettingsSchema = z.object({
  tenantId: TenantIdSchema.meta(none("Organization the settings belong to.")),
  moduleId: ModuleIdSchema.meta(none("Module the settings belong to.")),
  values: ModuleSettingsValuesSchema.nullable().meta(
    personal("Values validated by the module's settings contract; null until first saved."),
  ),
  updatedAt: IsoDateTimeSchema.nullable().meta(none("When the values last changed (UTC); null until first saved.")),
  updatedBy: z
    .string()
    .min(1)
    .nullable()
    .meta(personal("Actor id of the last editor (uid, device id or API key id); null until first saved.")),
});
export type ModuleSettings = z.infer<typeof ModuleSettingsSchema>;

export const ModuleSettingsContract = defineContract(ModuleSettingsSchema, {
  id: "modules.ModuleSettings",
  kind: "view",
  description: "Settings of one installed module in an organization; values follow the module's own settings contract.",
  examples: [
    {
      tenantId: EXAMPLE_IDS.organization,
      moduleId: "example",
      values: { greeting: "Olá", defaultBudget: { amountMinor: 150_000, currency: "BRL" } },
      updatedAt: EXAMPLE_TIMES.updated,
      updatedBy: EXAMPLE_IDS.user,
    },
    { tenantId: EXAMPLE_IDS.organization, moduleId: "example", values: null, updatedAt: null, updatedBy: null },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
});
