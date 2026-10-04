"use client";

import { type AgentCatalogEntry, listAgentCatalogEndpoint } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Keyed by the organization: enabled state, connector tools and module skills differ per tenant. */
export const agentCatalogKeys = {
  list: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "agent-catalog"),
};

/** `GET /v1/agents?organizationId=` (core.agent-settings.read): the subagents with their tools and skills there. */
export const agentCatalogQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: agentCatalogKeys.list(organizationId),
    queryFn: async ({ signal }): Promise<AgentCatalogEntry[]> =>
      (await callEndpoint(listAgentCatalogEndpoint, { query: { organizationId }, signal })).data,
  });

/** The agents available to one organization; idle until signed in. */
export const useAgentCatalog = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...agentCatalogQuery(callEndpoint, organizationId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};
