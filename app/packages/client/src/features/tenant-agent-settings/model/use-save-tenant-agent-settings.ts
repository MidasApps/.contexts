"use client";

import { type AgentSettings, type UpdateAgentSettingsInput, updateAgentSettingsEndpoint } from "@core/contracts";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { agentCatalogKeys } from "#/entities/agent-catalog/index.ts";
import { tenantAgentSettingsKeys } from "#/entities/agent-settings/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type AgentSettingsChange = {
  readonly patch: UpdateAgentSettingsInput;
  readonly next: AgentSettings;
  readonly done: string;
};
export type AgentSettingsFailure = { readonly message: string; readonly requestId: string | undefined };

const saveKey = (organizationId: string) => ["agent-settings-save", organizationId] as const;

/**
 * Saves one change of the organization's agent settings (`PATCH /v1/agent-settings?organizationId=`,
 * core.agent-settings.update). The control flips at once; a refusal puts the previous value back
 * and reports why. The catalog is refetched: enabling an agent changes its tools and skills there.
 *
 * `saving` is shared by every control of the organization: one change at a time, because each one
 * sends the whole list and a failed one restores its snapshot, which would undo a change made
 * meanwhile by another switch.
 */
export const useSaveTenantAgentSettings = (organizationId: string) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const [failure, setFailure] = useState<AgentSettingsFailure | null>(null);
  const saving = useIsMutating({ mutationKey: saveKey(organizationId) }) > 0;
  const mutation = useMutation({
    mutationKey: saveKey(organizationId),
    mutationFn: async (patch: UpdateAgentSettingsInput) =>
      (await callEndpoint(updateAgentSettingsEndpoint, { query: { organizationId }, body: patch })).data,
  });

  const save = async (current: AgentSettings, change: AgentSettingsChange): Promise<void> => {
    if (saving) return;
    const key = tenantAgentSettingsKeys.one(organizationId);
    setFailure(null);
    queryClient.setQueryData(key, change.next);
    try {
      const data = await mutation.mutateAsync(change.patch);
      queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: agentCatalogKeys.list(organizationId) });
      notify.success(change.done);
    } catch (error: unknown) {
      queryClient.setQueryData(key, current);
      const described = describe(error);
      setFailure({ message: described.message, requestId: described.requestId });
    }
  };

  return { save, saving, failure };
};
