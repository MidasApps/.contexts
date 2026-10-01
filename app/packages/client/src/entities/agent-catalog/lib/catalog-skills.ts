import type { AgentCatalogEntry, AgentCatalogSkill } from "@core/contracts";

/** A skill as the organization sees it: the agents that carry it and whether any of them is enabled. */
export type CatalogSkill = AgentCatalogSkill & {
  readonly agents: readonly Pick<AgentCatalogEntry, "key" | "name" | "enabled">[];
  readonly active: boolean;
};

/** The skills across the catalog, unique by name and sorted by it; a skill is active when one of its agents is enabled. */
export const skillsOfCatalog = (catalog: readonly AgentCatalogEntry[]): CatalogSkill[] => {
  const byName = new Map<string, CatalogSkill>();
  for (const agent of catalog) {
    for (const skill of agent.skills) {
      const known = byName.get(skill.name);
      const agents = [...(known?.agents ?? []), { key: agent.key, name: agent.name, enabled: agent.enabled }];
      byName.set(skill.name, { ...(known ?? skill), agents, active: agents.some((entry) => entry.enabled) });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
};
