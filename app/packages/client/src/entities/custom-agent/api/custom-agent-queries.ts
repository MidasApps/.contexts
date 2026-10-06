"use client";

import {
  type CustomAgent,
  type CustomAgentOptions,
  getCustomAgentEndpoint,
  getCustomAgentOptionsEndpoint,
} from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Under `["organizations", id]`: one organization's agents never show in another's cache. */
export const customAgentKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "custom-agents"),
  one: (organizationId: string, agentId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "custom-agents", agentId),
  /** Models, tools, platform skills, plan limits and their use (the use changes with every write). */
  options: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "custom-agent-options"),
};

/** `GET /v1/agents/{agentId}?organizationId=` (core.agent-settings.read): the whole record, for the editor. */
export const customAgentQuery = (callEndpoint: CallEndpoint, organizationId: string, agentId: string) =>
  queryOptions({
    queryKey: customAgentKeys.one(organizationId, agentId),
    queryFn: async ({ signal }): Promise<CustomAgent> =>
      (await callEndpoint(getCustomAgentEndpoint, { params: { agentId }, query: { organizationId }, signal })).data,
  });

/** One agent of the organization; idle until signed in and while `agentId` is `null`. */
export const useCustomAgent = (organizationId: string, agentId: string | null) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...customAgentQuery(callEndpoint, organizationId, agentId ?? ""),
    enabled: signedIn && organizationId !== "" && agentId !== null,
  });
};

/** `GET /v1/agent-options?organizationId=` (core.agent-settings.read): what an agent may select, the limits and their use. */
export const customAgentOptionsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: customAgentKeys.options(organizationId),
    queryFn: async ({ signal }): Promise<CustomAgentOptions> =>
      (await callEndpoint(getCustomAgentOptionsEndpoint, { query: { organizationId }, signal })).data,
  });

export const useCustomAgentOptions = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...customAgentOptionsQuery(callEndpoint, organizationId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};
