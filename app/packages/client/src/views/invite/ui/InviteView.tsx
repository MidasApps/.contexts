"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { AcceptInvitation, useInvitationToken } from "#/features/accept-invitation/index.ts";
import { SignInForm } from "#/features/auth-by-email/index.ts";
import { CreateAccountForm } from "#/features/create-account/index.ts";
import { MfaChallengeForm } from "#/features/mfa-challenge/index.ts";
import { SignOutButton } from "#/features/sign-out/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";
import { AuthTemplate } from "#/shared/ui/templates/AuthTemplate/AuthTemplate.tsx";
import { AuthBrand, EntryLocaleSwitcher } from "#/widgets/auth-entry/index.ts";

type SignedOutMode = "sign-in" | "create-account";

function Heading({ title, description, focusOnMount = false }: { title: string; description?: string; focusOnMount?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <div className="flex flex-col gap-1.5">
      <h1 ref={ref} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
        {title}
      </h1>
      {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function ModeSwitch({ prompt, action, onClick }: { prompt: string; action: string; onClick: () => void }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-1 text-sm text-muted-foreground">
      {prompt}
      <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={onClick}>
        {action}
      </Button>
    </p>
  );
}

/**
 * Signed out on the invitation: sign in, or create the account first (an invitee may have none,
 * SH-01). Either way the session follows and the preview appears on this page, token kept in memory.
 */
function SignedOutInvite() {
  const t = useTranslations("auth.invite");
  // `switched`: focus moves to the new heading only after a switch, never on the first render.
  const [{ mode, switched }, setView] = useState<{ mode: SignedOutMode; switched: boolean }>({ mode: "sign-in", switched: false });
  const switchTo = (next: SignedOutMode) => setView({ mode: next, switched: true });
  if (mode === "create-account") {
    return (
      <>
        <Heading key="create" title={t("createTitle")} description={t("createDescription")} focusOnMount={switched} />
        <CreateAccountForm />
        <ModeSwitch prompt={t("haveAccount")} action={t("signIn")} onClick={() => switchTo("sign-in")} />
      </>
    );
  }
  return (
    <>
      <Heading key="sign-in" title={t("signInTitle")} description={t("signInDescription")} focusOnMount={switched} />
      <SignInForm />
      <ModeSwitch prompt={t("noAccount")} action={t("createAccount")} onClick={() => switchTo("create-account")} />
    </>
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
  if (state.status === "signed-out") return <SignedOutInvite />;
  return (
    <>
      <Heading title={t("invite.title")} />
      <AcceptInvitation token={token} mismatchAction={<SignOutButton landing={null}>{t("invite.useAnotherAccount")}</SignOutButton>} />
    </>
  );
}

/**
 * `/invite#token=` (SP1 spec §6.2). The token is read from the fragment and removed from the
 * address bar at once. Signed-out visitors sign in, or create their account, right here
 * (redirecting to `/sign-in?next=` would either lose the token or put it in a query string that
 * reaches server logs); then the preview and "Accept" follow. Signing out after an email mismatch
 * keeps the token in memory, so the right account can sign in and accept. A language switch
 * carries the token in the fragment (decision 0049).
 */
export function InviteView({ brand, footer }: { brand?: ReactNode; footer?: ReactNode }) {
  const t = useTranslations("auth.invite");
  const token = useInvitationToken();
  const keepHash = token === null ? undefined : new URLSearchParams({ token }).toString();
  return (
    <AuthTemplate brand={brand ?? <AuthBrand />} footer={footer ?? <EntryLocaleSwitcher keepHash={keepHash} />}>
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
