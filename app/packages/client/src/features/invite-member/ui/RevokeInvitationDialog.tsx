"use client";

import { type Invitation, revokeInvitationEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { invitationKeys } from "#/entities/invitation/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { patchCachedLists } from "#/shared/api/optimistic-list.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type RevokeInvitationDialogProps = {
  organizationId: string;
  invitation: Invitation | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Revokes a pending invitation (`DELETE /v1/invitations/{id}`, core.member.invite): its link stops
 * working at once. The row shows `revoked` immediately and returns to `pending` if the API refuses.
 */
export function RevokeInvitationDialog({ organizationId, invitation, onOpenChange }: RevokeInvitationDialogProps) {
  const t = useTranslations("settings.invitations.revoke");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const revoke = async (target: Invitation): Promise<void> => {
    const rollback = await patchCachedLists<Invitation>(queryClient, invitationKeys.all(organizationId), (items) =>
      items.map((item) => (item.id === target.id ? { ...item, status: "revoked" } : item)),
    );
    try {
      await callEndpoint(revokeInvitationEndpoint, { params: { invitationId: target.id } });
    } catch (error: unknown) {
      rollback();
      throw error;
    } finally {
      void queryClient.invalidateQueries({ queryKey: invitationKeys.all(organizationId) });
    }
  };
  const action = useConfirmedAction(
    () => (invitation === null ? Promise.resolve() : revoke(invitation)),
    () => notify.success(t("done", { email: invitation?.email ?? "" })),
  );
  return (
    <ConfirmDialog
      open={invitation !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title")}
      description={t("description", { email: invitation?.email ?? "" })}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
