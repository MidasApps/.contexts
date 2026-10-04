"use client";

import {
  listAddendumActivationsEndpoint,
  listAddendumVersionsEndpoint,
  PROMPT_AGENT_IDS,
  type PromptActivation,
  type PromptAgentId,
  type PromptVersion,
} from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Whether an agent has a versioned prompt, so an organization can add its own instructions to it. */
export const isPromptAgentId = (agentKey: string): agentKey is PromptAgentId =>
  (PROMPT_AGENT_IDS as readonly string[]).includes(agentKey);

/** An organization's addendum of one agent; every write (version, eval, activation) invalidates `agent`. */
export const tenantAddendumKeys = {
  agent: (organizationId: string, agentId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "prompt-addendum", agentId),
  versions: (organizationId: string, agentId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "prompt-addendum", agentId, "versions"),
  activations: (organizationId: string, agentId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "prompt-addendum", agentId, "activations"),
};

/** `GET /v1/agents/{agentId}/prompt-addendum/versions?organizationId=` (core.prompt.read), newest first. */
export const addendumVersionsQuery = (callEndpoint: CallEndpoint, organizationId: string, agentId: PromptAgentId) =>
  queryOptions({
    queryKey: tenantAddendumKeys.versions(organizationId, agentId),
    queryFn: async ({ signal }): Promise<PromptVersion[]> =>
      (await callEndpoint(listAddendumVersionsEndpoint, { params: { agentId }, query: { organizationId }, signal }))
        .data,
  });

/** `GET /v1/agents/{agentId}/prompt-addendum/activations?organizationId=`, newest first: the first row is the active version. */
export const addendumActivationsQuery = (callEndpoint: CallEndpoint, organizationId: string, agentId: PromptAgentId) =>
  queryOptions({
    queryKey: tenantAddendumKeys.activations(organizationId, agentId),
    queryFn: async ({ signal }): Promise<PromptActivation[]> =>
      (await callEndpoint(listAddendumActivationsEndpoint, { params: { agentId }, query: { organizationId }, signal }))
        .data,
  });

export const useAddendumVersions = (
  organizationId: string,
  agentId: PromptAgentId,
  options: { enabled?: boolean } = {},
) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...addendumVersionsQuery(callEndpoint, organizationId, agentId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};

export const useAddendumActivations = (
  organizationId: string,
  agentId: PromptAgentId,
  options: { enabled?: boolean } = {},
) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...addendumActivationsQuery(callEndpoint, organizationId, agentId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};
