import type {
  BudgetCaps,
  OrganizationAdminSummary,
  TenantId,
  UpdateOrganizationAdminInput,
  UserPrincipal,
} from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import { summarizeOrganization } from "./list-organizations-admin.ts";
import { changeTenantBudget } from "./sync-tenant-budget.ts";

export type OrganizationAdminError = { readonly code: "NOT_FOUND" } | { readonly code: "PLAN_NOT_FOUND" };

type Command<I> = {
  readonly actor: UserPrincipal;
  readonly tenantId: TenantId;
  readonly requestId: string;
  readonly input: I;
};

export type UpdateOrganizationAdmin = (
  command: Command<UpdateOrganizationAdminInput>,
) => Promise<Result<OrganizationAdminSummary, OrganizationAdminError>>;
export type SetOrganizationBudget = (
  command: Command<{ readonly override: BudgetCaps | null }>,
) => Promise<Result<OrganizationAdminSummary, OrganizationAdminError>>;

const record = (
  deps: Pick<ConsoleDeps, "audit">,
  command: Command<unknown>,
  action: "ORGANIZATION_UPDATED" | "TENANT_BUDGET_UPDATED",
  changes: string[],
) =>
  deps.audit.record({
    log: "platform",
    action,
    actor: auditActorOf(command.actor),
    target: { type: "organization", id: command.tenantId },
    targetTenantId: command.tenantId,
    outcome: "success",
    requestId: command.requestId,
    changes,
  });

/**
 * `PATCH /v1/admin/organizations/{id}` (staff): the plan assignment (`organization-plans`) and the
 * SP1 `status` (`suspended` denies every tenant permission). The budget follows the plan.
 */
export const makeUpdateOrganizationAdmin =
  (deps: ConsoleDeps): UpdateOrganizationAdmin =>
  async (command) => {
    const org = await deps.organizations.getLive(command.tenantId);
    if (org === null) return err({ code: "NOT_FOUND" });
    const { planId, status } = command.input;
    const plan = planId === undefined || planId === null ? null : await deps.plans.get(planId);
    if (planId !== undefined && planId !== null && plan === null) return err({ code: "PLAN_NOT_FOUND" });
    const at = deps.clock.now().toISOString();
    if (planId !== undefined) {
      const limits =
        plan === null
          ? null
          : { monthlyMicroUsd: plan.limits.monthlyMicroUsd, monthlyTokens: plan.limits.monthlyTokens };
      const current = await deps.organizations.getPlan(command.tenantId);
      await changeTenantBudget(deps, {
        tenantId: command.tenantId,
        next: (inputs) => ({ ...inputs, plan: limits }),
        write: () => deps.organizations.setPlan({ ...current, planId, at, actorId: command.actor.uid }),
      });
    }
    if (
      status !== undefined &&
      !(await deps.organizations.setStatus({ tenantId: command.tenantId, status, at, actorId: command.actor.uid }))
    )
      return err({ code: "NOT_FOUND" });
    await record(deps, command, "ORGANIZATION_UPDATED", [
      ...(planId === undefined ? [] : ["planId"]),
      ...(status === undefined ? [] : ["status"]),
    ]);
    return ok(await summarizeOrganization(deps, (await deps.organizations.getLive(command.tenantId)) ?? org));
  };

/** `PUT /v1/admin/organizations/{id}/budget` (staff): override or clear the caps; audited with `targetTenantId`. */
export const makeSetOrganizationBudget =
  (deps: ConsoleDeps): SetOrganizationBudget =>
  async (command) => {
    const org = await deps.organizations.getLive(command.tenantId);
    if (org === null) return err({ code: "NOT_FOUND" });
    const current = await deps.organizations.getPlan(command.tenantId);
    const { override } = command.input;
    await changeTenantBudget(deps, {
      tenantId: command.tenantId,
      next: (inputs) => ({ ...inputs, override }),
      write: () =>
        deps.organizations.setPlan({
          ...current,
          budgetOverride: override,
          at: deps.clock.now().toISOString(),
          actorId: command.actor.uid,
        }),
    });
    await record(deps, command, "TENANT_BUDGET_UPDATED", ["budgetOverride"]);
    return ok(await summarizeOrganization(deps, org));
  };
