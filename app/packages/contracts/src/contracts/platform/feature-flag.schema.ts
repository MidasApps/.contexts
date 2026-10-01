import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

/** Dotted kebab-case flag key (`ai.kill-switch`). */
export const FeatureFlagKeySchema = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/, { error: "Expected a dotted kebab-case key." }).max(80);

export const FeatureFlagKindSchema = z.enum(["kill-switch", "rollout", "ops"]);
export type FeatureFlagKind = z.infer<typeof FeatureFlagKindSchema>;

const definitionShape = {
  key: FeatureFlagKeySchema.meta(none("Flag key.")),
  owner: z.string().trim().min(1).max(120).meta(none("Team or role that owns the flag (governance).")),
  reason: z.string().trim().min(1).max(500).meta(none("Why the flag exists.")),
  kind: FeatureFlagKindSchema.meta(none("`kill-switch`, `rollout` or `ops`.")),
  default: z.boolean().meta(none("Value when no environment or tenant value is set.")),
  createdAt: IsoDateTimeSchema.meta(none("When the flag was introduced (UTC).")),
  expiresAt: IsoDateTimeSchema.meta(none("When the flag must be removed or renewed (UTC); after createdAt.")),
};

const expiresAfterCreation = (flag: { createdAt: string; expiresAt: string }): boolean => Date.parse(flag.expiresAt) > Date.parse(flag.createdAt);
const EXPIRY_ERROR = { error: "expiresAt must be after createdAt.", path: ["expiresAt"] };

/** A flag of the code registry (decision 0039): every flag has an owner, a reason and an expiry. */
export const FeatureFlagDefinitionSchema = z.strictObject(definitionShape).refine(expiresAfterCreation, EXPIRY_ERROR);
export type FeatureFlagDefinition = z.infer<typeof FeatureFlagDefinitionSchema>;

const DEFINITION_EXAMPLE = {
  key: "ai.kill-switch",
  owner: "platform-team",
  reason: "Stops every agent and chat run during an incident.",
  kind: "kill-switch",
  default: false,
  createdAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2027-09-30T00:00:00.000Z",
} as const;

export const FeatureFlagDefinitionContract = defineContract(FeatureFlagDefinitionSchema, {
  id: "platform.FeatureFlagDefinition",
  kind: "entity",
  description: "A feature flag declared in the code registry, with owner, reason, kind and expiry.",
  examples: [DEFINITION_EXAMPLE],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.flag.manage",
});

/** A flag with its effective value, as `/v1/flags` and `/v1/admin/flags` return it. */
export const FeatureFlagSchema = z
  .strictObject({
    ...definitionShape,
    value: z.boolean().meta(none("Effective value in this environment (and tenant, when asked).")),
    tenantOverride: z.boolean().nullable().meta(none("Tenant override, null when none.")),
    expired: z.boolean().meta(none("True once expiresAt has passed; shown as a warning.")),
  })
  .refine(expiresAfterCreation, EXPIRY_ERROR);
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export const FeatureFlagContract = defineContract(FeatureFlagSchema, {
  id: "platform.FeatureFlag",
  kind: "view",
  description: "A feature flag with its effective value and expiry status.",
  examples: [{ ...DEFINITION_EXAMPLE, value: false, tenantOverride: null, expired: false }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "core.flag.read",
});

export const SetFeatureFlagValueInputSchema = z.strictObject({
  value: z.boolean().meta(none("New value.")),
  tenantId: TenantIdSchema.optional().meta(none("Organization to override; omitted = the environment value (staff only).")),
});
export type SetFeatureFlagValueInput = z.infer<typeof SetFeatureFlagValueInputSchema>;

export const SetFeatureFlagValueInputContract = defineContract(SetFeatureFlagValueInputSchema, {
  id: "platform.SetFeatureFlagValueInput",
  kind: "command",
  description: "Sets a flag value for the environment or overrides it for one organization.",
  examples: [{ value: true }, { value: false, tenantId: EXAMPLE_IDS.organization }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.flag.manage",
});

/** Body of `PUT /v1/flags/{flagKey}`: the organization comes from the query, never from the body. */
export const TenantFlagValueInputSchema = z.strictObject({ value: z.boolean().meta(none("Override for the organization.")) });
export type TenantFlagValueInput = z.infer<typeof TenantFlagValueInputSchema>;

export const TenantFlagValueInputContract = defineContract(TenantFlagValueInputSchema, {
  id: "platform.TenantFlagValueInput",
  kind: "command",
  description: "Overrides a tenant-overridable flag for the caller's organization (switch off, or back on when the environment allows).",
  examples: [{ value: false }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.flag.write",
});
