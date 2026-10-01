"use client";

import { updateAgentSettingsEndpoint, type AgentSettings, type UpdateAgentSettingsInput } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { agentCatalogKeys } from "#/entities/agent-catalog/index.ts";
import { tenantAgentSettingsKeys } from "#/entities/agent-settings/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type AgentSettingsChange = { readonly patch: UpdateAgentSettingsInput; readonly next: AgentSettings; readonly done: string };
export type AgentSettingsFailure = { readonly message: string; readonly requestId: string | undefined };

/**
 * Saves one change of the organization's agent settings (`PATCH /v1/agent-settings?organizationId=`,
 * core.agent-settings.update). The control flips at once; a refusal puts the previous value back
 * and reports why. The catalog is refetched: enabling an agent changes its tools and skills there.
 */
export const useSaveTenantAgentSettings = (organizationId: string) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<AgentSettingsFailure | null>(null);

  const save = async (current: AgentSettings, change: AgentSettingsChange): Promise<void> => {
    const key = tenantAgentSettingsKeys.one(organizationId);
    setFailure(null);
    setSaving(true);
    queryClient.setQueryData(key, change.next);
    try {
      const { data } = await callEndpoint(updateAgentSettingsEndpoint, { query: { organizationId }, body: change.patch });
      queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: agentCatalogKeys.list(organizationId) });
      notify.success(change.done);
    } catch (error: unknown) {
      queryClient.setQueryData(key, current);
      const described = describe(error);
      setFailure({ message: described.message, requestId: described.requestId });
    } finally {
      setSaving(false);
    }
  };

  return { save, saving, failure };
};
