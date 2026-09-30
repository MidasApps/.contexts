import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";

export const SetActiveOrganizationInputSchema = z.strictObject({
  organizationId: OrganizationIdSchema.meta(none("Organization to make active; the caller must be a member.")),
});
export type SetActiveOrganizationInput = z.infer<typeof SetActiveOrganizationInputSchema>;

export const SetActiveOrganizationInputContract = defineContract(SetActiveOrganizationInputSchema, {
  id: "identity.SetActiveOrganizationInput",
  kind: "command",
  description: "Switches the active organization (claims projection; the API never relies on it).",
  examples: [{ organizationId: EXAMPLE_IDS.organization }],
  pii: "none",
  tenancyScope: "user",
  relations: [],
  permission: "core.organization.read",
});
