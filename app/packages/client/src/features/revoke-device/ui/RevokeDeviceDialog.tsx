"use client";

import { type Device, revokeDeviceEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { deviceKeys } from "#/entities/device/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { patchCachedLists } from "#/shared/api/optimistic-list.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type RevokeDeviceDialogProps = {
  organizationId: string;
  device: Device | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Revokes a device (`DELETE /v1/devices/{id}`, core.device.revoke): its grants go, its tokens are
 * revoked and it cannot sign in again (SP1 spec §6.4). Optimistic `revoked` status with rollback.
 */
export function RevokeDeviceDialog({ organizationId, device, onOpenChange }: RevokeDeviceDialogProps) {
  const t = useTranslations("settings.devices.revoke");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const revoke = async (target: Device): Promise<void> => {
    const rollback = await patchCachedLists<Device>(queryClient, deviceKeys.all(organizationId), (items) =>
      items.map((item) => (item.id === target.id ? { ...item, status: "revoked" } : item)),
    );
    try {
      await callEndpoint(revokeDeviceEndpoint, { params: { deviceId: target.id } });
    } catch (error: unknown) {
      rollback();
      throw error;
    } finally {
      void queryClient.invalidateQueries({ queryKey: deviceKeys.all(organizationId) });
    }
  };
  const action = useConfirmedAction(
    () => (device === null ? Promise.resolve() : revoke(device)),
    () => notify.success(t("done", { name: device?.label ?? "" })),
  );
  return (
    <ConfirmDialog
      open={device !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name: device?.label ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
