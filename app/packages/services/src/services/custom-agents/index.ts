// Public API of the custom agents context (decision 0046): tenant-defined agents and skills.

export {
  CUSTOM_AGENTS_COLLECTION,
  CUSTOM_SKILLS_COLLECTION,
  createFirestoreCustomAgentRepository,
  createFirestoreCustomSkillRepository,
} from "./adapters/driven/firestore-custom-repositories.ts";
export {
  createInMemoryCustomAgentRepository,
  createInMemoryCustomSkillRepository,
  fixedCustomLimits,
} from "./adapters/driven/in-memory-custom-repositories.ts";
export { createPlanCustomLimitsReader, customLimitsOfPlan } from "./adapters/driven/plan-custom-limits.ts";
export { buildCustomAgentsRoutes, type CustomAgentsRouteDeps } from "./adapters/driving/custom-agents-route-handler.ts";
export { buildCustomSkillsRoutes } from "./adapters/driving/custom-skills-route-handler.ts";
export {
  CUSTOM_AGENTS_READ_PERMISSION,
  CUSTOM_AGENTS_WRITE_PERMISSION,
  type CustomAgentsCommand,
  type CustomAgentsDeps,
} from "./application/custom-agents-deps.ts";
export type {
  CustomAgentRepository,
  CustomLimitsReader,
  CustomSkillRepository,
} from "./application/ports/custom-agent-ports.ts";
export {
  ASSISTANT_CHAT_AGENT,
  type CustomAgentUsage,
  type IsChatAgentEnabled,
} from "./application/use-cases/custom-agent-reads.ts";
export {
  type CustomAgentsRuntimeReads,
  type CustomAgentsServices,
  createCustomAgentsServices,
  createFirebaseCustomAgentsServices,
} from "./composition.ts";
export {
  CustomAgentNotFoundError,
  CustomLimitReachedError,
  CustomSkillNameTakenError,
  CustomSkillNotFoundError,
  InvalidCustomDefinitionError,
} from "./domain/custom-agent-errors.ts";
