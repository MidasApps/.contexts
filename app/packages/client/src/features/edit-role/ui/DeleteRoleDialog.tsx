"use client";

import { deleteRoleEndpoint, type Role } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { roleKeys } from "#/entities/role/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type DeleteRoleDialogProps = {
  organizationId: string;
  customRole: Role | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Deletes a custom role (`DELETE /v1/roles/{id}`, core.role.delete). A role still granted answers
 * `ROLE_IN_USE`, which stays in the dialog with what to do next.
 */
export function DeleteRoleDialog({ organizationId, customRole: role, onOpenChange }: DeleteRoleDialogProps) {
  const t = useTranslations("settings.roles.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (role === null) return;
      await callEndpoint(deleteRoleEndpoint, { params: { roleId: role.id } });
      await queryClient.invalidateQueries({ queryKey: roleKeys.all(organizationId) });
    },
    () => notify.success(t("done", { name: role?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={role !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name: role?.name ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
