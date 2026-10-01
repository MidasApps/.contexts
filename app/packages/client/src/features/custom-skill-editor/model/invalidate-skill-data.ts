import type { QueryClient } from "@tanstack/react-query";
import { agentCatalogKeys } from "#/entities/agent-catalog/index.ts";
import { customAgentKeys } from "#/entities/custom-agent/index.ts";
import { customSkillKeys } from "#/entities/custom-skill/index.ts";

/**
 * After a skill write: the skill list, the options (their use counts skills) and the agent catalog
 * (a renamed, disabled or deleted skill changes what the agents that selected it show).
 */
export const invalidateSkillData = async (queryClient: QueryClient, organizationId: string): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: customSkillKeys.all(organizationId) }),
    queryClient.invalidateQueries({ queryKey: customAgentKeys.options(organizationId) }),
    queryClient.invalidateQueries({ queryKey: agentCatalogKeys.list(organizationId) }),
  ]);
};
