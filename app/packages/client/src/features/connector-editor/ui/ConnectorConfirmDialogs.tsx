"use client";

import { type Connector, deleteConnectorEndpoint, updateConnectorEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantConnectorKeys } from "#/entities/connector/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

type ConnectorDialogProps = {
  organizationId: string;
  connector: Connector | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Deletes a connector and its stored secret (`DELETE …/connectors/{id}`, core.connector.write).
 * The row stays until the API confirms; a failure stays in the dialog with its reference.
 */
export function DeleteConnectorDialog({ organizationId, connector, onOpenChange }: ConnectorDialogProps) {
  const t = useTranslations("settings.connectors.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (connector === null) return;
      await callEndpoint(deleteConnectorEndpoint, { params: { organizationId, connectorId: connector.id } });
      await queryClient.invalidateQueries({ queryKey: tenantConnectorKeys.all(organizationId) });
    },
    () => notify.success(t("done", { name: connector?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={connector !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name: connector?.name ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}

/**
 * Enables or disables a connector for agents (`PATCH …/connectors/{id}` `status`). A connector in
 * `error` is enabled again the same way once its cause is fixed.
 */
export function ToggleConnectorDialog({ organizationId, connector, onOpenChange }: ConnectorDialogProps) {
  const t = useTranslations("settings.connectors.toggle");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const disabling = connector?.status === "active";
  const action = useConfirmedAction(
    async () => {
      if (connector === null) return;
      await callEndpoint(updateConnectorEndpoint, {
        params: { organizationId, connectorId: connector.id },
        body: { status: disabling ? "disabled" : "active" },
      });
      await queryClient.invalidateQueries({ queryKey: tenantConnectorKeys.all(organizationId) });
    },
    () => notify.success(t(disabling ? "doneDisabled" : "doneEnabled", { name: connector?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={connector !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(disabling ? "disableTitle" : "enableTitle", { name: connector?.name ?? "" })}
      description={t(disabling ? "disableDescription" : "enableDescription")}
      confirmLabel={t(disabling ? "disableConfirm" : "enableConfirm")}
      destructive={disabling}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
