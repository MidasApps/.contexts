import { type CustomAgent, CustomAgentIdSchema, type CustomAgentLimits, type CustomSkill, CustomSkillIdSchema } from "@core/contracts";
import { paginateInMemory } from "../../../shared/pagination/page.ts";
import type { CustomAgentRepository, CustomLimitsReader, CustomSkillRepository } from "../../application/ports/custom-agent-ports.ts";

// Ids shaped like Firestore automatic ids: 20 letters and digits.
const idOf = (prefix: string, sequence: number): string => `${prefix}${String(sequence).padStart(20 - prefix.length, "0")}`;

// Descending order through an inverted sort key keeps `paginateInMemory` ascending.
const newestFirstKey = (createdAt: string): string => String(9e15 - Date.parse(createdAt));
const newestFirst = <T extends { createdAt: string; id: string }>(items: readonly T[]): T[] =>
  items.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));

/** In-memory `CustomAgentRepository` for unit tests; newest first like the Firestore index. */
export const createInMemoryCustomAgentRepository = (): CustomAgentRepository & { readonly rows: Map<string, CustomAgent> } => {
  const rows = new Map<string, CustomAgent>();
  let sequence = 0;
  const own = (tenantId: string) => [...rows.values()].filter((agent) => agent.tenantId === tenantId);
  return {
    rows,
    newId: () => CustomAgentIdSchema.parse(idOf("Ag", (sequence += 1))),
    get: (_tx, { tenantId, agentId }) => Promise.resolve(own(tenantId).find((agent) => agent.id === agentId) ?? null),
    listByTenant: ({ tenantId }) => Promise.resolve(newestFirst(own(tenantId))),
    count: ({ tenantId }) => Promise.resolve(own(tenantId).length),
    create: (_tx, { agent }) => void rows.set(agent.id, agent),
    replace: (_tx, { agent }) => void rows.set(agent.id, agent),
    delete: (_tx, { agentId }) => void rows.delete(agentId),
  };
};

/** In-memory `CustomSkillRepository` for unit tests. */
export const createInMemoryCustomSkillRepository = (): CustomSkillRepository & { readonly rows: Map<string, CustomSkill> } => {
  const rows = new Map<string, CustomSkill>();
  let sequence = 0;
  const own = (tenantId: string) => [...rows.values()].filter((skill) => skill.tenantId === tenantId);
  return {
    rows,
    newId: () => CustomSkillIdSchema.parse(idOf("Sk", (sequence += 1))),
    get: (_tx, { tenantId, skillId }) => Promise.resolve(own(tenantId).find((skill) => skill.id === skillId) ?? null),
    list: ({ tenantId, page }) => Promise.resolve(paginateInMemory({ items: own(tenantId), page, positionOf: (skill) => [newestFirstKey(skill.createdAt), skill.id] })),
    listByTenant: ({ tenantId }) => Promise.resolve(newestFirst(own(tenantId))),
    findByName: (_tx, { tenantId, name }) => Promise.resolve(own(tenantId).find((skill) => skill.name === name) ?? null),
    count: ({ tenantId }) => Promise.resolve(own(tenantId).length),
    create: (_tx, { skill }) => void rows.set(skill.id, skill),
    replace: (_tx, { skill }) => void rows.set(skill.id, skill),
    delete: (_tx, { skillId }) => void rows.delete(skillId),
  };
};

/** Fixed limits for unit tests. */
export const fixedCustomLimits = (limits: CustomAgentLimits): CustomLimitsReader => () => Promise.resolve(limits);
