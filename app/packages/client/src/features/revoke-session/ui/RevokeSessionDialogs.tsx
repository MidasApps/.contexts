"use client";

import type { SessionSummary } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useRevokeAllSessions, useRevokeSession } from "../model/use-revoke-session.ts";

export type RevokeSessionDialogProps = {
  session: SessionSummary | null;
  onOpenChange: (open: boolean) => void;
  label: string;
};

/** Confirms revoking one session (`label` names it: browser and OS family). */
export function RevokeSessionDialog({ session, onOpenChange, label }: RevokeSessionDialogProps) {
  const t = useTranslations("profile.sessions.revoke");
  const revoke = useRevokeSession();
  const action = useConfirmedAction(
    () => (session === null ? Promise.resolve() : revoke(session.id)),
    () => notify.success(t("done", { name: label })),
  );
  return (
    <ConfirmDialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title")}
      description={t("description", { name: label })}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}

/** "Sign out everywhere" button with its confirmation (this device included). */
export function SignOutEverywhereButton() {
  const t = useTranslations("profile.sessions.revokeAll");
  const [open, setOpen] = useState(false);
  const revokeAll = useRevokeAllSessions();
  const action = useConfirmedAction(revokeAll, () => notify.info(t("done")));
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Icon name="log-out" />
        {t("button")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) action.reset();
          setOpen(next);
        }}
        title={t("title")}
        description={t("description")}
        confirmLabel={t("confirm")}
        destructive
        onConfirm={action.confirm}
        error={action.error}
      />
    </>
  );
}
