// Composition root of the staff console and agent settings (SP5 Task 10, decisions 0039 and 0041).
import type { Sql } from "postgres";
import { type GetAgentSettings, makeGetAgentSettings } from "../agents/application/use-cases/get-agent-settings.ts";
import {
  makeUpdateAgentSettings,
  type UpdateAgentSettings,
} from "../agents/application/use-cases/update-agent-settings.ts";
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import type { ConsoleGateway } from "../observability/application/ports/console-gateway.ts";
import type { Clock } from "../shared/clock/clock.ts";
import type { FirebaseAdmin } from "../shared/firebase/firebase-admin.ts";
import {
  countAgentRuns,
  createPostgresUsageRepository,
  listActiveUserIds,
  listUsageBuckets,
} from "../usage/adapters/driven/postgres-usage-repository.ts";
import { createFirestoreApprovalStats } from "./adapters/driven/firestore-approval-stats.ts";
import {
  createFirestoreAgentSettingsRepository,
  createFirestoreOrganizationAdminStore,
  createFirestorePlanRepository,
} from "./adapters/driven/firestore-console-stores.ts";
import type { ConsoleDeps } from "./application/console-deps.ts";
import type { ConsoleUsage } from "./application/ports/console-ports.ts";
import { type GetAdminOverview, makeGetAdminOverview } from "./application/use-cases/get-admin-overview.ts";
import { type GetAdminUsage, makeGetAdminUsage } from "./application/use-cases/get-admin-usage.ts";
import {
  type GetOrganizationAdmin,
  type ListOrganizationsAdmin,
  makeGetOrganizationAdmin,
  makeListOrganizationsAdmin,
} from "./application/use-cases/list-organizations-admin.ts";
import { type ListPlans, makeListPlans } from "./application/use-cases/list-plans.ts";
import {
  makeSetOrganizationBudget,
  makeUpdateOrganizationAdmin,
  type SetOrganizationBudget,
  type UpdateOrganizationAdmin,
} from "./application/use-cases/update-organization-admin.ts";
import {
  type CreatePlan,
  type DeletePlan,
  makeCreatePlan,
  makeDeletePlan,
  makeUpdatePlan,
  type UpdatePlan,
} from "./application/use-cases/upsert-plan.ts";

export type ConsoleServices = {
  readonly listPlans: ListPlans;
  readonly createPlan: CreatePlan;
  readonly updatePlan: UpdatePlan;
  readonly deletePlan: DeletePlan;
  readonly listOrganizations: ListOrganizationsAdmin;
  readonly getOrganization: GetOrganizationAdmin;
  readonly updateOrganization: UpdateOrganizationAdmin;
  readonly setOrganizationBudget: SetOrganizationBudget;
  readonly getOverview: GetAdminOverview;
  readonly getUsage: GetAdminUsage;
  readonly getAgentSettings: GetAgentSettings;
  readonly updateAgentSettings: UpdateAgentSettings;
};

/** Binds the console use cases (in-memory stores in unit tests). */
export const createConsoleServices = (deps: ConsoleDeps): ConsoleServices => ({
  listPlans: makeListPlans(deps),
  createPlan: makeCreatePlan(deps),
  updatePlan: makeUpdatePlan(deps),
  deletePlan: makeDeletePlan(deps),
  listOrganizations: makeListOrganizationsAdmin(deps),
  getOrganization: makeGetOrganizationAdmin(deps),
  updateOrganization: makeUpdateOrganizationAdmin(deps),
  setOrganizationBudget: makeSetOrganizationBudget(deps),
  getOverview: makeGetAdminOverview(deps),
  getUsage: makeGetAdminUsage(deps),
  getAgentSettings: makeGetAgentSettings(deps),
  updateAgentSettings: makeUpdateAgentSettings(deps),
});

/** The budget table and month cost over the usage ledger (row level security per tenant, role `usage_runtime`). */
export const createPostgresConsoleUsage = (sql: Sql): ConsoleUsage => {
  const repository = createPostgresUsageRepository(sql);
  return {
    setTenantBudget: repository.setTenantBudget,
    monthCostMicroUsd: async (input) => (await repository.getMonthSpend(input)).costMicroUsd,
    activeUserIds: listActiveUserIds(sql),
    agentRunCounts: countAgentRuns(sql),
    usageBuckets: listUsageBuckets(sql),
  };
};

/**
 * Firestore + Postgres console services (web `/v1` routes; the Mastra `SettingsPort` reads `getAgentSettings`).
 * @param evals the runtime's experiments, for the overview's eval status (the web passes its console gateway).
 */
export const createFirebaseConsoleServices = (args: {
  readonly firebase: FirebaseAdmin;
  readonly sql: Sql;
  readonly audit: AuditWriter;
  readonly clock: Clock;
  readonly evals?: Pick<ConsoleGateway, "listExperiments">;
}): ConsoleServices =>
  createConsoleServices({
    plans: createFirestorePlanRepository({ firestore: args.firebase.firestore }),
    organizations: createFirestoreOrganizationAdminStore({ firestore: args.firebase.firestore }),
    agentSettings: createFirestoreAgentSettingsRepository({ firestore: args.firebase.firestore }),
    usage: createPostgresConsoleUsage(args.sql),
    audit: args.audit,
    clock: args.clock,
    approvals: createFirestoreApprovalStats({ firestore: args.firebase.firestore }),
    ...(args.evals === undefined ? {} : { evals: args.evals }),
  });
