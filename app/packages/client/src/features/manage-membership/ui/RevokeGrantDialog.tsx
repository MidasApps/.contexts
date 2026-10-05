"use client";

import { type Member, revokeMembershipEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { memberKeys } from "#/entities/member/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

type Grant = Member["grants"][number];

export type RevokeGrantDialogProps = {
  organizationId: string;
  /** The member and the grant to revoke; `null` closes the dialog. */
  target: { member: Member; grant: Grant } | null;
  onOpenChange: (open: boolean) => void;
  /** Where the grant applies, in words (the view passes `NodeName`). */
  nodeLabel: ReactNode;
};

const memberName = (member: Member): string => (member.displayName === "" ? member.email : member.displayName);

/**
 * Revokes one grant of a member (`DELETE /v1/memberships/{id}`, core.member.remove); the member keeps
 * the others. Removing the whole member stays "Remove". `LAST_OWNER` keeps the dialog open.
 */
export function RevokeGrantDialog({ organizationId, target, onOpenChange, nodeLabel }: RevokeGrantDialogProps) {
  const t = useTranslations("settings.members.revokeGrant");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const name = target === null ? "" : memberName(target.member);
  const action = useConfirmedAction(
    async () => {
      if (target === null) return;
      await callEndpoint(revokeMembershipEndpoint, { params: { membershipId: target.grant.membershipId } });
      await queryClient.invalidateQueries({ queryKey: memberKeys.all(organizationId) });
    },
    () => notify.success(t("done", { name })),
  );
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name })}
      description={
        <>
          {t("description")} <span className="font-medium text-foreground">{nodeLabel}</span>
        </>
      }
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
