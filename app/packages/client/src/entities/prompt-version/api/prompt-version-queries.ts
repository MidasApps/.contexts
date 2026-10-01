"use client";

import { adminListPromptActivationsEndpoint, adminListPromptVersionsEndpoint, type PromptActivation, type PromptAgentId, type PromptVersion } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Platform prompt data of one agent; every write (version, eval, activation) invalidates `agent`. */
export const promptVersionKeys = {
  agent: (agentId: string): QueryKey => ["admin", "prompts", agentId],
  versions: (agentId: string): QueryKey => ["admin", "prompts", agentId, "versions"],
  activations: (agentId: string): QueryKey => ["admin", "prompts", agentId, "activations"],
};

/** `GET /v1/admin/agents/{agentId}/prompt-versions` (staff, platform.prompt.manage), newest first. */
export const promptVersionsQuery = (callEndpoint: CallEndpoint, agentId: PromptAgentId) =>
  queryOptions({
    queryKey: promptVersionKeys.versions(agentId),
    queryFn: async ({ signal }): Promise<PromptVersion[]> => (await callEndpoint(adminListPromptVersionsEndpoint, { params: { agentId }, signal })).data,
  });

/** `GET /v1/admin/agents/{agentId}/activations`, newest first: the first row is the active version. */
export const promptActivationsQuery = (callEndpoint: CallEndpoint, agentId: PromptAgentId) =>
  queryOptions({
    queryKey: promptVersionKeys.activations(agentId),
    queryFn: async ({ signal }): Promise<PromptActivation[]> => (await callEndpoint(adminListPromptActivationsEndpoint, { params: { agentId }, signal })).data,
  });

export const usePromptVersions = (agentId: PromptAgentId, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...promptVersionsQuery(callEndpoint, agentId), enabled: signedIn && options.enabled !== false });
};

export const usePromptActivations = (agentId: PromptAgentId, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...promptActivationsQuery(callEndpoint, agentId), enabled: signedIn && options.enabled !== false });
};

/** The active version: the one of the newest activation; `undefined` while the code seed is in use. */
export const activeVersionOf = (versions: readonly PromptVersion[], activations: readonly PromptActivation[]): PromptVersion | undefined => {
  const activeId = activations[0]?.versionId;
  return activeId === undefined ? undefined : versions.find((version) => version.id === activeId);
};
