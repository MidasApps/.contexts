"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { CreateAccountForm } from "#/features/create-account/index.ts";
import { MfaChallengeForm } from "#/features/mfa-challenge/index.ts";
import { useClientConfig } from "#/shared/config/config-context.tsx";
import { nextRoute } from "#/shared/lib/router/entry-routes.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";
import { AuthTemplate } from "#/shared/ui/templates/AuthTemplate/AuthTemplate.tsx";
import { AuthBrand, EntryLocaleSwitcher } from "#/widgets/auth-entry/index.ts";

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Open sign-up is off: accounts come from invitations; send the visitor to sign in. */
function SignUpClosed() {
  const t = useTranslations("auth.signUp");
  return (
    <>
      <h1 className="sr-only">{t("title")}</h1>
      <StatePanel
        icon="lock"
        tone="neutral"
        frame="plain"
        title={t("closedTitle")}
        description={t("closedDescription")}
        action={
          <Button variant="secondary" asChild>
            <RouteLink to={{ id: "sign-in" }}>{t("goToSignIn")}</RouteLink>
          </Button>
        }
      />
    </>
  );
}

function SignUpBody({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  const { state } = useSession();
  if (state.status === "mfa-required") {
    return (
      <>
        <Heading title={t("mfa.title")} description={t("mfa.description")} />
        <MfaChallengeForm challenge={state.challenge} />
      </>
    );
  }
  if (state.status !== "signed-out") {
    return (
      <>
        <h1 className="sr-only">{t("signUp.title")}</h1>
        <LoadingState variant="spinner" label={state.status === "signed-in" ? t("signIn.redirecting") : t("signIn.loading")} />
      </>
    );
  }
  return (
    <>
      <Heading title={t("signUp.title")} description={t("signUp.description")} />
      <CreateAccountForm />
      <p className="text-center text-sm text-muted-foreground">
        {t("signUp.haveAccount")}{" "}
        <RouteLink to={{ id: "sign-in", next: next ?? undefined }} className="font-medium text-foreground underline underline-offset-4">
          {t("signUp.signIn")}
        </RouteLink>
      </p>
    </>
  );
}

/**
 * `/sign-up?next=` (decision 0049): a new email/password account when the app offers open
 * sign-up (`selfServeSignUp`), then on to `next` or home (which leads a user without
 * organizations to create one or ask for an invitation). Closed apps explain that accounts come
 * from invitations.
 */
export function SignUpView({ brand, footer }: { brand?: ReactNode; footer?: ReactNode }) {
  const config = useClientConfig();
  const session = useSession();
  const router = useRouter();
  const next = router.useSearchParam("next");
  const target = useMemo(() => nextRoute(next), [next]);
  const signedIn = session.state.status === "signed-in";

  const left = useRef(false);
  useEffect(() => {
    if (!signedIn || left.current) return;
    left.current = true;
    router.navigate(target, { replace: true });
  }, [signedIn, target, router]);

  return (
    <AuthTemplate brand={brand ?? <AuthBrand />} footer={footer ?? <EntryLocaleSwitcher />}>
      {config.selfServeSignUp === true ? <SignUpBody next={next} /> : <SignUpClosed />}
    </AuthTemplate>
  );
}
