import type { Plan, UpsertPlanInput, UserPrincipal } from "@core/contracts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import { syncTenantBudget, tightenTenantBudget } from "./sync-tenant-budget.ts";

type StaffCommand = { readonly actor: UserPrincipal; readonly requestId: string; readonly input: UpsertPlanInput };

export type CreatePlan = (command: StaffCommand) => Promise<Plan>;
export type UpdatePlan = (
  command: StaffCommand & { readonly planId: string },
) => Promise<Result<Plan, { readonly code: "NOT_FOUND" }>>;

const audit = (
  deps: Pick<ConsoleDeps, "audit">,
  command: StaffCommand,
  action: "PLAN_CREATED" | "PLAN_UPDATED",
  planId: string,
) =>
  deps.audit.record({
    log: "platform",
    action,
    actor: auditActorOf(command.actor),
    target: { type: "plan", id: planId },
    outcome: "success",
    requestId: command.requestId,
    changes: ["name", "limits"],
  });

/** `POST /v1/admin/plans`: a new plan (automatic id), audited `PLAN_CREATED` on the platform log. */
export const makeCreatePlan =
  (deps: Pick<ConsoleDeps, "plans" | "audit" | "clock">): CreatePlan =>
  async (command) => {
    const plan = await deps.plans.create({
      ...command.input,
      at: deps.clock.now().toISOString(),
      actorId: command.actor.uid,
    });
    await audit(deps, command, "PLAN_CREATED", plan.id);
    return plan;
  };

/**
 * `PUT /v1/admin/plans/{planId}`: replaces name and limits, then re-materializes the budget of
 * every organization on the plan (decision 0039 amendment), audited `PLAN_UPDATED`. Each
 * organization's caps are first tightened to the lower of the old and new limits, so a failed
 * replace or upsert never leaves caps looser than either (`changeTenantBudget`).
 */
export const makeUpdatePlan =
  (deps: ConsoleDeps): UpdatePlan =>
  async (command) => {
    if ((await deps.plans.get(command.planId)) === null) return err({ code: "NOT_FOUND" });
    const tenants = await deps.organizations.tenantsOnPlan(command.planId);
    const limits = {
      monthlyMicroUsd: command.input.limits.monthlyMicroUsd,
      monthlyTokens: command.input.limits.monthlyTokens,
    };
    for (const tenantId of tenants)
      await tightenTenantBudget(deps, tenantId, (inputs) => ({ ...inputs, plan: limits }));
    const plan = await deps.plans.replace({
      id: command.planId,
      ...command.input,
      at: deps.clock.now().toISOString(),
      actorId: command.actor.uid,
    });
    if (plan === null) return err({ code: "NOT_FOUND" });
    await audit(deps, command, "PLAN_UPDATED", plan.id);
    for (const tenantId of tenants) await syncTenantBudget(deps, tenantId);
    return ok(plan);
  };
