"use client";

import { CircleAlertIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { useAcceptInvitation, useInvitationPreview } from "../model/use-accept-invitation.ts";

// Failures the user cannot fix by retrying: the invitation is gone, used or not theirs.
const FINAL_CODES = new Set(["NOT_FOUND", "INVITATION_EXPIRED", "INVITATION_ALREADY_USED", "EMAIL_MISMATCH", "VALIDATION_FAILED"]);

export type AcceptInvitationProps = {
  /** From `useInvitationToken()` (already validated). */
  token: string;
  /** Offered when the invitation belongs to another email (the page passes "use another account"). */
  mismatchAction?: ReactNode;
};

function FinalProblem({ error, mismatchAction }: { error: unknown; mismatchAction: ReactNode }) {
  const t = useTranslations("auth.invite");
  const described = useDescribeError()(error);
  return (
    <StatePanel
      role="alert"
      icon="alert-triangle"
      tone="amber"
      title={t("errorTitle")}
      description={described.message}
      action={
        <>
          {described.code === "EMAIL_MISMATCH" ? mismatchAction : null}
          <Button variant="secondary" asChild>
            <RouteLink to={{ id: "home" }}>{t("goHome")}</RouteLink>
          </Button>
        </>
      }
    />
  );
}

function AcceptFailure({ error, mismatchAction }: { error: unknown; mismatchAction: ReactNode }) {
  const t = useTranslations();
  const described = useDescribeError()(error);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [error]);
  return (
    <Alert ref={ref} variant="destructive" tabIndex={-1}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{t("auth.invite.acceptFailed")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-inherit">
        <p>{described.message}</p>
        {described.requestId === undefined ? null : <p className="font-mono text-xs">{t("common.errorState.reference", { requestId: described.requestId })}</p>}
        {described.code === "EMAIL_MISMATCH" && mismatchAction !== undefined ? <div>{mismatchAction}</div> : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Invitation acceptance (SP1 spec §6.2): preview (organization, inviter, masked email, expiry),
 * then accept → the user joins and lands in the organization. Expired, used or foreign
 * invitations end in a final state; transient failures offer a retry with the request reference.
 */
export function AcceptInvitation({ token, mismatchAction }: AcceptInvitationProps) {
  const t = useTranslations("auth.invite");
  const formatDateTime = useFormatDateTime();
  const router = useRouter();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();

  if (preview.isPending) return <LoadingState label={t("loading")} rows={4} />;
  if (preview.isError) {
    const code = (preview.error as { code?: unknown }).code;
    if (typeof code === "string" && FINAL_CODES.has(code)) return <FinalProblem error={preview.error} mismatchAction={mismatchAction} />;
    return <ApiErrorState error={preview.error} headingLevel={2} onRetry={() => void preview.refetch()} retrying={preview.isFetching} />;
  }
  const invitation = preview.data;
  const onAccept = () =>
    accept.mutate(token, {
      onSuccess: ({ organizationId }) => {
        notify.success(t("accepted", { organization: invitation.organizationName }));
        router.navigate({ id: "organization", organizationId }, { replace: true });
      },
    });

  return (
    <div className="flex flex-col gap-5" data-slot="invitation-preview">
      <p className="text-sm leading-relaxed">
        {invitation.inviterDisplayName.trim() === ""
          ? t("previewNoInviter", { organization: invitation.organizationName })
          : t("preview", { inviter: invitation.inviterDisplayName, organization: invitation.organizationName })}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted-foreground">{t("invitedEmail")}</dt>
        <dd className="font-mono">{invitation.maskedEmail}</dd>
        <dt className="text-muted-foreground">{t("expires")}</dt>
        <dd>{formatDateTime(invitation.expiresAt, "datetime")}</dd>
      </dl>
      {accept.isError ? <AcceptFailure error={accept.error} mismatchAction={mismatchAction} /> : null}
      <div className="flex flex-col gap-2">
        <Button pending={accept.isPending} onClick={onAccept} className="w-full">
          {t("accept")}
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <RouteLink to={{ id: "home" }}>{t("decline")}</RouteLink>
        </Button>
      </div>
    </div>
  );
}
