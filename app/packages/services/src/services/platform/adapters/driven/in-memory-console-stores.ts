import type { BudgetCaps, OrganizationStatus, Plan } from "@core/contracts";
import { PlanIdSchema } from "@core/contracts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type {
  AgentSettingsRepository,
  ConsoleUsage,
  OrganizationAdminStore,
  OrganizationPlan,
  PlanRepository,
  StoredAgentSettings,
  UsageBucket,
} from "../../application/ports/console-ports.ts";

type InMemoryOrganization = { id: string; name: string; status: OrganizationStatus };
type ActivityRow = { tenantId: string; userId: string; at: Date };
type AgentRunRow = { tenantId: string; at: Date; stoppedBy: string | null };
type UsageRow = UsageBucket & { tenantId: string };

const createInMemoryPlanRepository = (plans: Map<string, Plan>): PlanRepository => {
  let sequence = 0;
  return {
    list: () => Promise.resolve([...plans.values()].sort((a, b) => a.name.localeCompare(b.name))),
    get: (planId) => Promise.resolve(plans.get(planId) ?? null),
    create: ({ name, limits, at }) => {
      sequence += 1;
      const plan: Plan = {
        id: PlanIdSchema.parse(`plan${String(sequence).padStart(16, "0")}`),
        name,
        limits,
        createdAt: at,
        updatedAt: at,
      };
      plans.set(plan.id, plan);
      return Promise.resolve(plan);
    },
    replace: ({ id, name, limits, at }) => {
      const current = plans.get(id);
      if (current === undefined) return Promise.resolve(null);
      const plan = { ...current, name, limits, updatedAt: at };
      plans.set(id, plan);
      return Promise.resolve(plan);
    },
  };
};

const createInMemoryOrganizationStore = (args: {
  organizations: Map<string, InMemoryOrganization>;
  assignments: Map<string, OrganizationPlan>;
  members: Readonly<Record<string, readonly string[]>> | undefined;
}): OrganizationAdminStore => {
  const { organizations, assignments } = args;
  return {
    listLive: ({ after, limit }) => {
      const sorted = [...organizations.values()]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .filter((org) => after === undefined || org.id > after[1]);
      return Promise.resolve(
        pageFromOverfetch({ fetched: sorted.slice(0, limit + 1), limit, positionOf: (org) => [org.id, org.id] }),
      );
    },
    getLive: (tenantId) => Promise.resolve(organizations.get(tenantId) ?? null),
    setStatus: ({ tenantId, status }) => {
      const org = organizations.get(tenantId);
      if (org === undefined) return Promise.resolve(false);
      organizations.set(tenantId, { ...org, status });
      return Promise.resolve(true);
    },
    getPlan: (tenantId) =>
      Promise.resolve(assignments.get(tenantId) ?? { tenantId, planId: null, budgetOverride: null }),
    setPlan: ({ tenantId, planId, budgetOverride }) => {
      assignments.set(tenantId, { tenantId, planId, budgetOverride });
      return Promise.resolve();
    },
    countMembers: (tenantId) => Promise.resolve(new Set(args.members?.[tenantId] ?? []).size),
    tenantsOnPlan: (planId) =>
      Promise.resolve([...assignments.values()].filter((row) => row.planId === planId).map((row) => row.tenantId)),
  };
};

const createInMemorySettingsRepository = (settings: Map<string, StoredAgentSettings>): AgentSettingsRepository => ({
  get: (tenantId) => Promise.resolve(settings.get(tenantId) ?? null),
  save: (stored) => {
    settings.set(stored.settings.tenantId, stored);
    return Promise.resolve();
  },
});

const createInMemoryConsoleUsage = (args: {
  budgets: Map<string, BudgetCaps>;
  costs: Map<string, number>;
  usageRows: readonly UsageRow[];
  activity: readonly ActivityRow[];
  agentRuns: readonly AgentRunRow[];
}): ConsoleUsage => {
  const { budgets, costs, usageRows, activity, agentRuns } = args;
  return {
    setTenantBudget: ({ tenantId, budget }) => {
      budgets.set(tenantId, budget);
      return Promise.resolve();
    },
    monthCostMicroUsd: ({ tenantId }) => Promise.resolve(costs.get(tenantId) ?? 0),
    usageBuckets: ({ tenantId, from, to }) =>
      Promise.resolve(
        usageRows
          .filter(
            (row) =>
              row.tenantId === tenantId &&
              row.day >= from.toISOString().slice(0, 10) &&
              new Date(`${row.day}T00:00:00.000Z`) < to,
          )
          .map(
            (row): UsageBucket => ({
              day: row.day,
              provider: row.provider,
              model: row.model,
              calls: row.calls,
              inputTokens: row.inputTokens,
              outputTokens: row.outputTokens,
              costMicroUsd: row.costMicroUsd,
              unpricedCalls: row.unpricedCalls,
            }),
          ),
      ),
    activeUserIds: ({ tenantId, since }) =>
      Promise.resolve([
        ...new Set(activity.filter((row) => row.tenantId === tenantId && row.at >= since).map((row) => row.userId)),
      ]),
    agentRunCounts: ({ tenantId, since }) => {
      const runs = agentRuns.filter((row) => row.tenantId === tenantId && row.at >= since);
      return Promise.resolve({ runs: runs.length, stopped: runs.filter((row) => row.stoppedBy !== null).length });
    },
  };
};

/** In-memory console stores for unit tests; every map is inspectable. */
export const createInMemoryConsoleStores = (
  seed: {
    organizations?: readonly { id: string; name?: string; status?: OrganizationStatus }[];
    /** User ids holding a grant, per organization (one entry per grant: repeats are the same person). */
    members?: Readonly<Record<string, readonly string[]>>;
  } = {},
) => {
  const plans = new Map<string, Plan>();
  const organizations = new Map(
    seed.organizations?.map((org) => [
      org.id,
      { id: org.id, name: org.name ?? org.id, status: org.status ?? "active" },
    ]) ?? [],
  );
  const assignments = new Map<string, OrganizationPlan>();
  const settings = new Map<string, StoredAgentSettings>();
  const budgets = new Map<string, BudgetCaps>();
  const costs = new Map<string, number>();
  const activity: ActivityRow[] = [];
  const agentRuns: AgentRunRow[] = [];
  /** Ledger rows already grouped by tenant, UTC day and model (what the Postgres adapter answers). */
  const usageRows: UsageRow[] = [];
  const stores = {
    plans: createInMemoryPlanRepository(plans),
    organizations: createInMemoryOrganizationStore({ organizations, assignments, members: seed.members }),
    agentSettings: createInMemorySettingsRepository(settings),
    usage: createInMemoryConsoleUsage({ budgets, costs, usageRows, activity, agentRuns }),
  };
  return {
    stores,
    plans,
    organizations,
    assignments,
    settings,
    budgets,
    costs,
    activity,
    agentRuns,
    usageRows,
  };
};
