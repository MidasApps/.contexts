import { defineContract, MoneySchema, type Plan, type UpsertPlanInput } from "@core/contracts";
import { z } from "zod";
import { microUsdToMoney, moneyToMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";

const LABELS = "admin.plans.form";

/** Feature keys as typed: dotted kebab-case keys separated by commas, spaces or line breaks. */
const FEATURE_LIST = /^(?:[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*(?:[\s,]+|$))*$/u;

/**
 * The plan form (`POST|PUT /v1/admin/plans`): what staff type. The spend cap is money in USD (the
 * API stores micro-USD) and the features are one text field; `toUpsertPlanInput` converts both.
 * The API validates the full input again.
 */
export const PlanFormSchema = z.object({
  name: z.string().trim().min(1).max(80).meta({ description: "Display name of the plan.", pii: "none", ui: { labelKey: `${LABELS}.name`, order: 1 } }),
  monthlyBudget: MoneySchema.meta({ description: "Monthly model spend cap.", pii: "none", ui: { widget: "money", labelKey: `${LABELS}.monthlyBudget`, order: 2 } }),
  monthlyTokens: z.int().nonnegative().meta({ description: "Monthly model token cap.", pii: "none", ui: { labelKey: `${LABELS}.monthlyTokens`, order: 3 } }),
  maxConnectors: z.int().nonnegative().meta({ description: "Most connectors an organization may configure.", pii: "none", ui: { labelKey: `${LABELS}.maxConnectors`, order: 4 } }),
  features: z
    .string()
    .trim()
    .max(2000)
    .regex(FEATURE_LIST)
    .optional()
    .meta({ description: "Feature keys the plan includes, separated by commas.", pii: "none", ui: { widget: "textarea", labelKey: `${LABELS}.features`, order: 5 } }),
});
export type PlanForm = z.infer<typeof PlanFormSchema>;

export const PlanFormContract = defineContract(PlanFormSchema, {
  id: "client.PlanForm",
  kind: "command",
  description: "Client form behind POST and PUT /v1/admin/plans.",
  examples: [{ name: "Standard", monthlyBudget: { amountMinor: 5000, currency: "USD" }, monthlyTokens: 20_000_000, maxConnectors: 5, features: "web-tools" }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
});

/** Unique feature keys in the order typed. */
export const parseFeatures = (text: string | undefined): string[] => [...new Set((text ?? "").split(/[\s,]+/u).filter(Boolean))];

export const toUpsertPlanInput = (form: PlanForm): UpsertPlanInput => ({
  name: form.name,
  limits: {
    monthlyMicroUsd: moneyToMicroUsd(form.monthlyBudget),
    monthlyTokens: form.monthlyTokens,
    maxConnectors: form.maxConnectors,
    features: parseFeatures(form.features),
  },
});

/** Form values of an existing plan (edit) or of a new one. */
export const planFormDefaults = (plan: Plan | null): Partial<PlanForm> =>
  plan === null
    ? { name: "", monthlyBudget: { amountMinor: 0, currency: "USD" }, monthlyTokens: 0, maxConnectors: 0, features: "" }
    : {
        name: plan.name,
        monthlyBudget: microUsdToMoney(plan.limits.monthlyMicroUsd),
        monthlyTokens: plan.limits.monthlyTokens,
        maxConnectors: plan.limits.maxConnectors,
        features: plan.limits.features.join(", "),
      };
