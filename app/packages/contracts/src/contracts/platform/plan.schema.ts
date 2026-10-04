import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_TIMES } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { firestoreIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { hasUniqueItems } from "../primitives/refinements.ts";

export const PlanIdSchema = firestoreIdSchema<"PlanId">();
export type PlanId = z.infer<typeof PlanIdSchema>;

const limit = (description: string) => z.int().nonnegative().meta(none(description));

/** Limits a plan grants (decision 0039); every tenant budget derives from them. */
export const PlanLimitsSchema = z.strictObject({
  monthlyMicroUsd: limit("Monthly model spend cap in micro-USD."),
  monthlyTokens: limit("Monthly model token cap."),
  maxConnectors: limit("Most connectors an organization may configure."),
  // Decision 0046: optional so plans stored before it stay valid; absent means the platform default.
  maxCustomAgents: limit("Most custom agents an organization may have; absent means the platform default.").optional(),
  maxCustomSkills: limit("Most custom skills an organization may have; absent means the platform default.").optional(),
  maxCustomInstructionChars: limit(
    "Longest instructions of a custom agent or skill, in characters; absent means the platform default.",
  ).optional(),
  features: z
    .array(z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/))
    .max(50)
    .refine(hasUniqueItems, { error: "Features must be unique." })
    .meta(none("Feature keys the plan includes.")),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

const PlanNameSchema = z.string().trim().min(1).max(80);

/** A commercial plan (Firestore `plans`, platform data managed by staff). */
export const PlanSchema = z.strictObject({
  id: PlanIdSchema.meta(none("Automatic id of the plan.")),
  name: PlanNameSchema.meta(none("Display name of the plan.")),
  limits: PlanLimitsSchema.meta(none("Limits the plan grants.")),
  createdAt: IsoDateTimeSchema.meta(none("When the plan was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the plan last changed (UTC).")),
});
export type Plan = z.infer<typeof PlanSchema>;

const LIMITS_EXAMPLE = {
  monthlyMicroUsd: 50_000_000,
  monthlyTokens: 20_000_000,
  maxConnectors: 5,
  features: ["web-tools"],
};

export const PlanContract = defineContract(PlanSchema, {
  id: "platform.Plan",
  kind: "entity",
  description: "A plan with the spend, token and connector limits it grants to organizations.",
  examples: [
    {
      id: "Pl1aB2cD3eF4gH5iJ6kL",
      name: "Standard",
      limits: LIMITS_EXAMPLE,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.plan.manage",
});

export const UpsertPlanInputSchema = z.strictObject({
  name: PlanNameSchema.meta(none("Display name of the plan.")),
  limits: PlanLimitsSchema.meta(none("Limits the plan grants.")),
});
export type UpsertPlanInput = z.infer<typeof UpsertPlanInputSchema>;

export const UpsertPlanInputContract = defineContract(UpsertPlanInputSchema, {
  id: "platform.UpsertPlanInput",
  kind: "command",
  description: "Creates or replaces a plan (staff).",
  examples: [{ name: "Standard", limits: LIMITS_EXAMPLE }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.plan.manage",
});
