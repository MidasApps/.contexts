"use client";

import { type ChatAgentOption, listChatAgentsEndpoint } from "@core/contracts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";

/** The id of the platform's assistant, the default agent of a new conversation. */
export const ASSISTANT_AGENT_ID = "assistant";

export const chatAgentsKey = (organizationId: string): QueryKey =>
  queryKeys.organizationScoped(organizationId, "chat-agents");

/**
 * `GET /v1/chat-agents` (decision 0046): the agents the member can start a conversation with —
 * the assistant and the organization's enabled agents. Without `core.chat.use` (403) the list is
 * empty (a 404 too: the organization is not visible here): only the assistant answers.
 */
export const useChatAgents = (organizationId: string): UseQueryResult<readonly ChatAgentOption[]> => {
  const callEndpoint = useCallEndpoint();
  return useQuery({
    queryKey: chatAgentsKey(organizationId),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<readonly ChatAgentOption[]> => {
      try {
        return (await callEndpoint(listChatAgentsEndpoint, { query: { organizationId }, signal })).data;
      } catch (error: unknown) {
        if (isApiErrorStatus(error, 403) || isApiErrorStatus(error, 404)) return [];
        throw error;
      }
    },
  });
};
