// Composition root of the custom agents context (decision 0046).
import type { CustomAgent, CustomAgentId, CustomSkill, TenantId } from "@core/contracts";
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import { createFirestoreOrganizationAdminStore, createFirestorePlanRepository } from "../platform/adapters/driven/firestore-console-stores.ts";
import type { Clock } from "../shared/clock/clock.ts";
import type { FirebaseAdmin } from "../shared/firebase/firebase-admin.ts";
import { createFirestoreUnitOfWork, type UnitOfWork } from "../shared/firestore/unit-of-work.ts";
import { createFirestoreCustomAgentRepository, createFirestoreCustomSkillRepository } from "./adapters/driven/firestore-custom-repositories.ts";
import { createPlanCustomLimitsReader } from "./adapters/driven/plan-custom-limits.ts";
import type { CustomAgentsDeps } from "./application/custom-agents-deps.ts";
import {
  type GetCustomAgentUsage,
  type IsChatAgentEnabled,
  type ListChatAgents,
  makeGetCustomAgentUsage,
  makeIsChatAgentEnabled,
  makeListChatAgents,
} from "./application/use-cases/custom-agent-reads.ts";
import {
  type CreateCustomAgent,
  type DeleteCustomAgent,
  type GetCustomAgent,
  makeCreateCustomAgent,
  makeDeleteCustomAgent,
  makeGetCustomAgent,
  makeUpdateCustomAgent,
  type UpdateCustomAgent,
} from "./application/use-cases/custom-agent-use-cases.ts";
import {
  type CreateCustomSkill,
  type DeleteCustomSkill,
  type GetCustomSkill,
  type ListCustomSkills,
  makeCreateCustomSkill,
  makeDeleteCustomSkill,
  makeGetCustomSkill,
  makeListCustomSkills,
  makeUpdateCustomSkill,
  type UpdateCustomSkill,
} from "./application/use-cases/custom-skill-use-cases.ts";

/**
 * Server-side reads for the agent runtime: no authorization, the tenant comes from the verified
 * context of the run. `getAgent` answers an agent in any enabled state; the runtime decides.
 */
export type CustomAgentsRuntimeReads = {
  readonly getAgent: (input: { readonly tenantId: TenantId; readonly agentId: CustomAgentId }) => Promise<CustomAgent | null>;
  readonly listAgents: (input: { readonly tenantId: TenantId }) => Promise<readonly CustomAgent[]>;
  readonly listSkills: (input: { readonly tenantId: TenantId }) => Promise<readonly CustomSkill[]>;
};

export type CustomAgentsServices = {
  readonly createCustomAgent: CreateCustomAgent;
  readonly getCustomAgent: GetCustomAgent;
  readonly updateCustomAgent: UpdateCustomAgent;
  readonly deleteCustomAgent: DeleteCustomAgent;
  readonly listCustomSkills: ListCustomSkills;
  readonly getCustomSkill: GetCustomSkill;
  readonly createCustomSkill: CreateCustomSkill;
  readonly updateCustomSkill: UpdateCustomSkill;
  readonly deleteCustomSkill: DeleteCustomSkill;
  readonly getCustomAgentUsage: GetCustomAgentUsage;
  readonly listChatAgents: ListChatAgents;
  /** `/v1/chat`: whether a conversation may run on this custom agent. */
  readonly isChatAgentEnabled: IsChatAgentEnabled;
  readonly runtime: CustomAgentsRuntimeReads;
};

/** Binds the custom agents use cases (in-memory adapters in unit tests). */
export const createCustomAgentsServices = (deps: CustomAgentsDeps): CustomAgentsServices => ({
  createCustomAgent: makeCreateCustomAgent(deps),
  getCustomAgent: makeGetCustomAgent(deps),
  updateCustomAgent: makeUpdateCustomAgent(deps),
  deleteCustomAgent: makeDeleteCustomAgent(deps),
  listCustomSkills: makeListCustomSkills(deps),
  getCustomSkill: makeGetCustomSkill(deps),
  createCustomSkill: makeCreateCustomSkill(deps),
  updateCustomSkill: makeUpdateCustomSkill(deps),
  deleteCustomSkill: makeDeleteCustomSkill(deps),
  getCustomAgentUsage: makeGetCustomAgentUsage(deps),
  listChatAgents: makeListChatAgents(deps),
  isChatAgentEnabled: makeIsChatAgentEnabled(deps),
  runtime: {
    getAgent: ({ tenantId, agentId }) => deps.agents.get(undefined, { tenantId, agentId }),
    listAgents: ({ tenantId }) => deps.agents.listByTenant({ tenantId }),
    listSkills: ({ tenantId }) => deps.skills.listByTenant({ tenantId }),
  },
});

/** Firestore services (web `/v1` routes and the Mastra runtime port); limits come from the organization's plan. */
export const createFirebaseCustomAgentsServices = (args: {
  readonly firebase: FirebaseAdmin;
  readonly audit: AuditWriter;
  readonly clock: Clock;
  readonly unitOfWork?: UnitOfWork;
}): CustomAgentsServices => {
  const { firestore } = args.firebase;
  return createCustomAgentsServices({
    agents: createFirestoreCustomAgentRepository({ firestore }),
    skills: createFirestoreCustomSkillRepository({ firestore }),
    limits: createPlanCustomLimitsReader({ organizations: createFirestoreOrganizationAdminStore({ firestore }), plans: createFirestorePlanRepository({ firestore }) }),
    audit: args.audit,
    unitOfWork: args.unitOfWork ?? createFirestoreUnitOfWork({ firestore }),
    clock: args.clock,
  });
};
