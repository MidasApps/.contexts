"use client";

import { type AdminImpersonationSession, adminEndImpersonationSessionEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { impersonationSessionKeys } from "#/entities/impersonation-session/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useImpersonationStore } from "../model/use-impersonation-store.ts";

export type EndImpersonationSessionDialogProps = {
  session: AdminImpersonationSession | null;
  /** Names of the staff member and of the user, as the list shows them. */
  staffLabel: string;
  userLabel: string;
  onOpenChange: (open: boolean) => void;
};

/**
 * Ends any staff member's support access session
 * (`POST /v1/admin/impersonation-sessions/{sessionId}/end`, platform.user.impersonate; audited on
 * the platform and tenant logs). The access stops at once. When the session is the one this tab
 * started, the tab forgets it too. A failure stays in the dialog with the request reference.
 */
export function EndImpersonationSessionDialog({
  session,
  staffLabel,
  userLabel,
  onOpenChange,
}: EndImpersonationSessionDialogProps) {
  const t = useTranslations("admin.impersonation.endAny");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (session === null) return;
      await callEndpoint(adminEndImpersonationSessionEndpoint, { params: { sessionId: session.id } });
      const store = useImpersonationStore.getState();
      if (store.session?.sessionId === session.id) store.reset();
      await queryClient.invalidateQueries({ queryKey: impersonationSessionKeys.all() });
    },
    () => notify.success(t("done", { staff: staffLabel })),
  );
  return (
    <ConfirmDialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title")}
      description={t("description", { staff: staffLabel, user: userLabel })}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
