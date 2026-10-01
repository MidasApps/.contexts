"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { AcceptInvitation, useInvitationToken } from "#/features/accept-invitation/index.ts";
import { SignInForm } from "#/features/auth-by-email/index.ts";
import { MfaChallengeForm } from "#/features/mfa-challenge/index.ts";
import { SignOutButton } from "#/features/sign-out/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";
import { AuthTemplate } from "#/shared/ui/templates/AuthTemplate/AuthTemplate.tsx";

function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function InviteBody({ token }: { token: string }) {
  const t = useTranslations("auth");
  const { state } = useSession();
  if (state.status === "booting" || state.status === "exchanging") return <LoadingState variant="spinner" label={t("signIn.loading")} />;
  if (state.status === "mfa-required") {
    return (
      <>
        <Heading title={t("mfa.title")} description={t("mfa.description")} />
        <MfaChallengeForm challenge={state.challenge} />
      </>
    );
  }
  if (state.status === "signed-out") {
    return (
      <>
        <Heading title={t("invite.signInTitle")} description={t("invite.signInDescription")} />
        <SignInForm />
      </>
    );
  }
  return (
    <>
      <Heading title={t("invite.title")} />
      <AcceptInvitation token={token} mismatchAction={<SignOutButton landing={null}>{t("invite.useAnotherAccount")}</SignOutButton>} />
    </>
  );
}

/**
 * `/invite#token=` (SP1 spec §6.2). The token is read from the fragment and removed from the
 * address bar at once. Signed-out visitors sign in right here (redirecting to `/sign-in?next=`
 * would either lose the token or put it in a query string that reaches server logs); then the
 * preview and "Accept" follow. Signing out after an email mismatch keeps the token in memory, so
 * the right account can sign in and accept.
 */
export function InviteView({ brand, footer }: { brand?: ReactNode; footer?: ReactNode }) {
  const t = useTranslations("auth.invite");
  const token = useInvitationToken();
  return (
    <AuthTemplate brand={brand} footer={footer}>
      {token === null ? (
        <>
          <h1 className="sr-only">{t("title")}</h1>
          <StatePanel
            icon="alert-triangle"
            tone="amber"
            frame="plain"
            title={t("missingTokenTitle")}
            description={t("missingTokenDescription")}
            action={
              <Button variant="secondary" asChild>
                <RouteLink to={{ id: "home" }}>{t("goHome")}</RouteLink>
              </Button>
            }
          />
        </>
      ) : (
        <InviteBody token={token} />
      )}
    </AuthTemplate>
  );
}
