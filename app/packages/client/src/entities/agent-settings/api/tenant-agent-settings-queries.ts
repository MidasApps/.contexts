"use client";

import { getAgentSettingsEndpoint, type AgentSettings } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Keyed by the organization: a member of two organizations never reads one's settings in the other. */
export const tenantAgentSettingsKeys = {
  one: (organizationId: string): QueryKey => ["organizations", organizationId, "agent-settings"],
};

/** `GET /v1/agent-settings?organizationId=` (core.agent-settings.read): enabled agents, web opt-ins, PII mode and the caps in force. */
export const tenantAgentSettingsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: tenantAgentSettingsKeys.one(organizationId),
    queryFn: async ({ signal }): Promise<AgentSettings> => (await callEndpoint(getAgentSettingsEndpoint, { query: { organizationId }, signal })).data,
  });

/** The organization's own agent settings; idle until signed in. `PATCH` them with `updateAgentSettingsEndpoint` and invalidate `tenantAgentSettingsKeys.one`. */
export const useTenantAgentSettings = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...tenantAgentSettingsQuery(callEndpoint, organizationId), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};
