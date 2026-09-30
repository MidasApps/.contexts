import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { RegionalDefaultsSchema } from "./regional-defaults.schema.ts";

export const CreateOrganizationInputSchema = z.strictObject({
  name: NodeNameSchema.meta(none("Display name of the new organization.")),
  defaults: z.strictObject(RegionalDefaultsSchema.shape).meta(none("Regional defaults: locale, time zone and currency.")),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInputSchema>;

export const CreateOrganizationInputContract = defineContract(CreateOrganizationInputSchema, {
  id: "tenancy.CreateOrganizationInput",
  kind: "command",
  description: "Creates an organization; the caller becomes its owner (self-serve flag, SP1 spec §6.1).",
  examples: [{ name: "Northwind", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } }],
  pii: "none",
  tenancyScope: "user",
  relations: [],
});
