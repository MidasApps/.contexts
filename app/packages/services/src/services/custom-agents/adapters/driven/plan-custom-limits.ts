import { CUSTOM_AGENT_LIMIT_DEFAULTS, type CustomAgentLimits, type PlanLimits } from "@core/contracts";
import type { OrganizationAdminStore, PlanRepository } from "../../../platform/application/ports/console-ports.ts";
import type { CustomLimitsReader } from "../../application/ports/custom-agent-ports.ts";

/** A plan's custom agent limits; what it does not set is the platform default (decision 0046 §12). */
export const customLimitsOfPlan = (limits: PlanLimits | null): CustomAgentLimits => ({
  maxAgents: limits?.maxCustomAgents ?? CUSTOM_AGENT_LIMIT_DEFAULTS.maxAgents,
  maxSkills: limits?.maxCustomSkills ?? CUSTOM_AGENT_LIMIT_DEFAULTS.maxSkills,
  maxInstructionChars: limits?.maxCustomInstructionChars ?? CUSTOM_AGENT_LIMIT_DEFAULTS.maxInstructionChars,
});

/**
 * `CustomLimitsReader` over the plan assignment of an organization (`organization-plans/{tenantId}`
 * → `plans/{planId}`, decision 0039). No plan, or a deleted one, means the platform defaults.
 */
export const createPlanCustomLimitsReader =
  (deps: { readonly organizations: Pick<OrganizationAdminStore, "getPlan">; readonly plans: Pick<PlanRepository, "get"> }): CustomLimitsReader =>
  async (tenantId) => {
    const { planId } = await deps.organizations.getPlan(tenantId);
    const plan = planId === null ? null : await deps.plans.get(planId);
    return customLimitsOfPlan(plan?.limits ?? null);
  };
