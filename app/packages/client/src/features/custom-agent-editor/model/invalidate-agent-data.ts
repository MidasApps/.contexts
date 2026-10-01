import type { QueryClient } from "@tanstack/react-query";
import { agentCatalogKeys } from "#/entities/agent-catalog/index.ts";
import { customAgentKeys } from "#/entities/custom-agent/index.ts";

/** After an agent write: the catalog (it lists the organization's agents), the records and the options (their use counts agents). */
export const invalidateAgentData = async (queryClient: QueryClient, organizationId: string): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: agentCatalogKeys.list(organizationId) }),
    queryClient.invalidateQueries({ queryKey: customAgentKeys.all(organizationId) }),
    queryClient.invalidateQueries({ queryKey: customAgentKeys.options(organizationId) }),
  ]);
};
