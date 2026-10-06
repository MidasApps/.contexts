"use client";

import { type AgentSettings, getOrganizationAgentSettingsEndpoint } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Subagents every organization can enable (SP3); module agents appear once they are enabled. */
export const CORE_SUBAGENT_KEYS = ["knowledge", "data", "action", "web"] as const;

/** Under `["admin", "organizations", …]`, so organization changes by staff invalidate it too. */
export const adminAgentSettingsKeys = {
  one: (organizationId: string): QueryKey => ["admin", "organizations", "agent-settings", organizationId],
};

/** `GET /v1/admin/organizations/{id}/agent-settings` (staff, platform.agent.manage). */
export const adminAgentSettingsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: adminAgentSettingsKeys.one(organizationId),
    queryFn: async ({ signal }): Promise<AgentSettings> =>
      (await callEndpoint(getOrganizationAgentSettingsEndpoint, { params: { organizationId }, signal })).data,
  });

/** One organization's agent settings as staff read them; idle until an organization is chosen. */
export const useAdminAgentSettings = (organizationId: string | undefined) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...adminAgentSettingsQuery(callEndpoint, organizationId ?? ""),
    enabled: signedIn && organizationId !== undefined && organizationId !== "",
  });
};

/**
 * Agents the console lists for an organization: the core subagents, then the other registered
 * subagents (when the catalog is known), then any other one the organization has enabled.
 */
export const listedAgentKeys = (
  settings: Pick<AgentSettings, "enabledAgents">,
  registered: readonly string[] = [],
): string[] => [...new Set([...CORE_SUBAGENT_KEYS, ...registered, ...settings.enabledAgents])];
