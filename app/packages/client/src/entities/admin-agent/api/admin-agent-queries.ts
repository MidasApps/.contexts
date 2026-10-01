"use client";

import { adminListAgentsEndpoint, type AdminAgent } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const adminAgentKeys = {
  all: (): QueryKey => ["admin", "agents"],
  catalog: (): QueryKey => ["admin", "agents", "catalog"],
};

/**
 * `GET /v1/admin/agents` (staff, platform.agent.manage; decision 0044): the agents the runtime
 * registered. It changes only with a deploy, so it stays fresh for five minutes.
 */
export const adminAgentCatalogQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: adminAgentKeys.catalog(),
    queryFn: async ({ signal }): Promise<AdminAgent[]> => (await callEndpoint(adminListAgentsEndpoint, { signal })).data,
    staleTime: 5 * 60_000,
  });

export const useAdminAgentCatalog = (options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminAgentCatalogQuery(callEndpoint), enabled: signedIn && options.enabled !== false });
};
