"use client";

import { deleteCustomAgentEndpoint, updateCustomAgentEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { invalidateAgentData } from "../model/invalidate-agent-data.ts";

/** What the catalog knows of an organization's agent: enough to enable, disable or delete it. */
export type CustomAgentRef = { readonly id: string; readonly name: string; readonly enabled: boolean };

type AgentDialogProps = { organizationId: string; agent: CustomAgentRef | null; onOpenChange: (open: boolean) => void };

/**
 * Deletes an agent of the organization (`DELETE /v1/agents/{id}`, core.agent-settings.update). Its
 * conversations stay readable. A failure stays in the dialog with its reference.
 */
export function DeleteCustomAgentDialog({ organizationId, agent, onOpenChange }: AgentDialogProps) {
  const t = useTranslations("settings.agents.custom.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (agent === null) return;
      await callEndpoint(deleteCustomAgentEndpoint, { params: { agentId: agent.id }, query: { organizationId } });
      await invalidateAgentData(queryClient, organizationId);
    },
    () => notify.success(t("done", { name: agent?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={agent !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name: agent?.name ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}

/** Lets members chat with an agent, or stops it (`PATCH /v1/agents/{id}` `enabled`). */
export function ToggleCustomAgentDialog({ organizationId, agent, onOpenChange }: AgentDialogProps) {
  const t = useTranslations("settings.agents.custom.toggle");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const disabling = agent?.enabled === true;
  const action = useConfirmedAction(
    async () => {
      if (agent === null) return;
      await callEndpoint(updateCustomAgentEndpoint, { params: { agentId: agent.id }, query: { organizationId }, body: { enabled: !disabling } });
      await invalidateAgentData(queryClient, organizationId);
    },
    () => notify.success(t(disabling ? "doneDisabled" : "doneEnabled", { name: agent?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={agent !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(disabling ? "disableTitle" : "enableTitle", { name: agent?.name ?? "" })}
      description={t(disabling ? "disableDescription" : "enableDescription")}
      confirmLabel={t(disabling ? "disableConfirm" : "enableConfirm")}
      destructive={disabling}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
