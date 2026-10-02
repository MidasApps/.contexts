"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { SignInForm } from "#/features/auth-by-email/index.ts";
import { MfaChallengeForm } from "#/features/mfa-challenge/index.ts";
import { useClientConfig } from "#/shared/config/config-context.tsx";
import { nextRoute } from "#/shared/lib/router/entry-routes.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import type { SignedOutReason } from "#/shared/lib/session/session-state.ts";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { AuthTemplate } from "#/shared/ui/templates/AuthTemplate/AuthTemplate.tsx";
import { AuthBrand, EntryLocaleSwitcher } from "#/widgets/auth-entry/index.ts";

export { nextRoute };

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SignedOutNotice({ reason }: { reason: SignedOutReason }) {
  const t = useTranslations("auth.signIn");
  if (reason === "none") return null;
  return (
    <Alert variant={reason === "session-expired" ? "warning" : "info"}>
      <AlertDescription className="text-inherit">{reason === "session-expired" ? t("sessionExpired") : t("signedOut")}</AlertDescription>
    </Alert>
  );
}

/** "No account yet? Create account", only when the app offers open sign-up (decision 0050). */
function SignUpPrompt({ next }: { next: string | null }) {
  const t = useTranslations("auth.signIn");
  const config = useClientConfig();
  if (config.selfServeSignUp !== true) return null;
  return (
    <p className="text-center text-sm text-muted-foreground">
      {t("noAccount")}{" "}
      <RouteLink to={{ id: "sign-up", next: next ?? undefined }} className="font-medium text-foreground underline underline-offset-4">
        {t("createAccount")}
      </RouteLink>
    </p>
  );
}

/**
 * `/sign-in?next=` (SP2 spec §4): email + password, then the second factor when the account has
 * one. A signed-in session is sent to `next` (internal routes only) or home. Brand and language
 * picker by default (SH-12); hosts may pass their own.
 */
export function SignInView({ brand, footer }: { brand?: ReactNode; footer?: ReactNode }) {
  const t = useTranslations("auth");
  const session = useSession();
  const router = useRouter();
  const next = router.useSearchParam("next");
  const target = useMemo(() => nextRoute(next), [next]);
  const signedIn = session.state.status === "signed-in";

  // Once: after navigating, `?next=` is gone and the target would fall back to home.
  const left = useRef(false);
  useEffect(() => {
    if (!signedIn || left.current) return;
    left.current = true;
    router.navigate(target, { replace: true });
  }, [signedIn, target, router]);

  const { state } = session;
  return (
    <AuthTemplate brand={brand ?? <AuthBrand />} footer={footer ?? <EntryLocaleSwitcher />}>
      {state.status === "mfa-required" ? (
        <>
          <Heading title={t("mfa.title")} description={t("mfa.description")} />
          <MfaChallengeForm challenge={state.challenge} />
        </>
      ) : state.status === "signed-out" ? (
        <>
          <Heading title={t("signIn.title")} description={t("signIn.description")} />
          <SignedOutNotice reason={state.reason} />
          <SignInForm />
          <SignUpPrompt next={next} />
        </>
      ) : (
        <>
          <h1 className="sr-only">{t("signIn.title")}</h1>
          <LoadingState variant="spinner" label={signedIn ? t("signIn.redirecting") : t("signIn.loading")} />
        </>
      )}
    </AuthTemplate>
  );
}
