"use client";

import { endImpersonationEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { impersonationSessionKeys } from "#/entities/impersonation-session/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { useAsyncAction } from "#/shared/lib/errors/use-async-action.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useImpersonationStore, type StoredImpersonation } from "../model/use-impersonation-store.ts";

export type OpenImpersonationSessionProps = {
  session: StoredImpersonation;
  /** Display name of the session's organization when the caller knows it. */
  organizationName?: string | undefined;
};

/**
 * The impersonation session this tab started: who, where and until when, with "open the app as
 * this user" (while the one-time token is still in memory) and "end session". Opening signs the
 * tab in as the user, read-only; the staff account comes back by reloading or signing in again,
 * and the session can then be ended here until it expires.
 */
export function OpenImpersonationSession({ session, organizationName }: OpenImpersonationSessionProps) {
  const t = useTranslations("admin.impersonation.session");
  const online = useOnlineStatus();
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const callEndpoint = useCallEndpoint();
  const formatDateTime = useFormatDateTime();
  const customToken = useImpersonationStore((state) => state.customToken);
  const consumeToken = useImpersonationStore((state) => state.consumeToken);
  const reset = useImpersonationStore((state) => state.reset);
  const [ending, setEnding] = useState(false);
  const open = useAsyncAction();
  const end = useConfirmedAction(
    async () => {
      await callEndpoint(endImpersonationEndpoint, { params: { sessionId: session.sessionId } });
      reset();
      await queryClient.invalidateQueries({ queryKey: impersonationSessionKeys.all() });
    },
    () => notify.success(t("ended")),
  );

  const openAsUser = (token: string): Promise<boolean> =>
    open.run(async () => {
      await auth.signInWithCustomToken(token);
      consumeToken();
      // Everything cached belongs to the staff account.
      queryClient.clear();
      router.navigate({ id: "home" });
    });

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">{t("user")}</dt>
          <dd className="font-mono text-sm break-all">{session.targetUid}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">{t("organization")}</dt>
          <dd className="text-sm break-all">{organizationName ?? session.organizationId}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">{t("expires")}</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm">
            {formatDateTime(session.expiresAt)}
            <StatusPill tone="amber" icon="eye">
              {t("readOnly")}
            </StatusPill>
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{customToken === null ? t("tokenUsed") : t("openHint")}</p>
      {open.error === undefined ? null : (
        <p role="alert" className="text-sm font-medium text-destructive-text">
          {open.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {customToken === null ? null : (
          <Button onClick={() => void openAsUser(customToken)} pending={open.pending} disabled={!online}>
            {t("open")}
          </Button>
        )}
        <Button variant="outline" onClick={() => setEnding(true)} disabled={!online || open.pending}>
          {t("end")}
        </Button>
      </div>
      <ConfirmDialog
        open={ending}
        onOpenChange={(next) => {
          if (!next) end.reset();
          setEnding(next);
        }}
        title={t("endTitle")}
        description={t("endDescription")}
        confirmLabel={t("endConfirm")}
        destructive
        onConfirm={end.confirm}
        error={end.error}
      />
    </div>
  );
}
