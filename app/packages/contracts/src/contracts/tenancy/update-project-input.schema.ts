import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { CurrencySchema } from "../primitives/money.schema.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";
import { NodeNameSchema } from "./organization.schema.ts";
import { ProjectDescriptionSchema, ProjectStatusSchema } from "./project.schema.ts";

/** Override changes of a project or unit: a value sets it, `null` clears it (inherit again). */
export const NodeRegionalOverridesPatchSchema = z.strictObject({
  timeZone: TimeZoneSchema.nullable().optional().meta(none("New IANA time zone; null inherits the parent's again.")),
  currency: CurrencySchema.nullable().optional().meta(none("New ISO 4217 currency; null inherits the parent's again.")),
});

export const UpdateProjectInputSchema = z
  .strictObject({
    name: NodeNameSchema.optional().meta(none("New display name.")),
    description: ProjectDescriptionSchema.nullable().optional().meta(personal("New description; null removes it.")),
    status: ProjectStatusSchema.optional().meta(none("Archive or reactivate the project.")),
    settings: NodeRegionalOverridesPatchSchema.optional().meta(none("Regional override changes.")),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export const UpdateProjectInputContract = defineContract(UpdateProjectInputSchema, {
  id: "tenancy.UpdateProjectInput",
  kind: "command",
  description: "Changes a project (`core.project.update` at the project).",
  examples: [{ name: "Launch 2" }, { status: "archived" }, { settings: { timeZone: null } }],
  pii: "personal",
  tenancyScope: "project",
  relations: [],
  permission: "core.project.update",
});
