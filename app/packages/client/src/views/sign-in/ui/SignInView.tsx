"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { SignInForm } from "#/features/auth-by-email/index.ts";
import { MfaChallengeForm } from "#/features/mfa-challenge/index.ts";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import type { SignedOutReason } from "#/shared/lib/session/session-state.ts";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { AuthTemplate } from "#/shared/ui/templates/AuthTemplate/AuthTemplate.tsx";

const HOME: Route = { id: "home" };
const ENTRY_ROUTES = new Set<Route["id"]>(["sign-in", "invite"]);

/**
 * Where to go after signing in: `?next=` when it is a route of the app (never another origin:
 * `parseRoute` only yields internal routes) and not an entry page, else home.
 */
export const nextRoute = (next: string | null): Route => {
  if (next === null || !next.startsWith("/") || next.startsWith("//")) return HOME;
  const route = parseRoute(next);
  return route === null || ENTRY_ROUTES.has(route.id) ? HOME : route;
};

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

/**
 * `/sign-in?next=` (SP2 spec §4): email + password, then the second factor when the account has
 * one. A signed-in session is sent to `next` (internal routes only) or home.
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
    <AuthTemplate brand={brand} footer={footer}>
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
