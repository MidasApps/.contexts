"use client";

import { type Member, removeMemberEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { memberKeys } from "#/entities/member/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { patchCachedLists } from "#/shared/api/optimistic-list.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type RemoveMemberDialogProps = {
  organizationId: string;
  member: Member | null;
  onOpenChange: (open: boolean) => void;
};

/** `DELETE …/members/{uid}` with the row removed at once and restored when the API refuses. */
const useRemoveMember = (organizationId: string) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return async (member: Member): Promise<void> => {
    const rollback = await patchCachedLists<Member>(queryClient, memberKeys.all(organizationId), (items) =>
      items.filter((item) => item.uid !== member.uid),
    );
    try {
      await callEndpoint(removeMemberEndpoint, { params: { organizationId, userId: member.uid } });
    } catch (error: unknown) {
      rollback();
      throw error;
    } finally {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all(organizationId) });
    }
  };
};

/**
 * Removes a member from the organization (core.member.remove): every grant and every API key they
 * own there go with it (SP1 spec §5.3), which the confirmation says. `LAST_OWNER` keeps the
 * dialog open with the explanation.
 */
export function RemoveMemberDialog({ organizationId, member, onOpenChange }: RemoveMemberDialogProps) {
  const t = useTranslations("settings.members.remove");
  const remove = useRemoveMember(organizationId);
  const name = member === null ? "" : member.displayName === "" ? member.email : member.displayName;
  const action = useConfirmedAction(
    () => (member === null ? Promise.resolve() : remove(member)),
    () => notify.success(t("done", { name })),
  );
  return (
    <ConfirmDialog
      open={member !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
