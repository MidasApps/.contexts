import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { OrganizationIdSchema } from "./ids.schema.ts";
import { RegionalDefaultsSchema } from "./regional-defaults.schema.ts";

export const OrganizationStatusSchema = z.enum(["active", "suspended"]);
export type OrganizationStatus = z.infer<typeof OrganizationStatusSchema>;

/** Display name of an organization, project or unit. */
export const NodeNameSchema = z.string().trim().min(1).max(120);

export const OrganizationSchema = z.object({
  id: OrganizationIdSchema.meta(none("Automatic id of the organization; equals tenantId.")),
  tenantId: TenantIdSchema.meta(none("Tenant id; an organization is its own tenant (decision 0006).")),
  name: NodeNameSchema.meta(none("Display name of the organization.")),
  status: OrganizationStatusSchema.meta(none("`suspended` denies every tenant permission until reactivated.")),
  defaults: z.object(RegionalDefaultsSchema.shape).meta(none("Regional defaults: locale, time zone and currency.")),
  createdAt: IsoDateTimeSchema.meta(none("When the organization was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the organization last changed (UTC).")),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const ORGANIZATION_EXAMPLE = {
  id: EXAMPLE_IDS.organization,
  tenantId: EXAMPLE_IDS.organization,
  name: "Northwind",
  status: "active",
  defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" },
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.updated,
} as const;

export const OrganizationContract = defineContract(OrganizationSchema, {
  id: "tenancy.Organization",
  kind: "entity",
  description: "An organization: the tenant that owns projects, units, roles and memberships.",
  examples: [ORGANIZATION_EXAMPLE],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.organization.read",
});
