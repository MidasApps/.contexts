"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { useStoredImpersonation } from "#/features/admin-impersonation/index.ts";
import { SignOutButton } from "#/features/sign-out/index.ts";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { useAuthState } from "#/shared/lib/auth/use-auth-state.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";

/** The `imp` claim of the current ID token (SP1: the impersonation session id), or `null`. */
const useImpersonationClaim = (): string | null => {
  const auth = useAuth();
  const state = useAuthState();
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const read = async (): Promise<void> => {
      const claims = state.status === "signed-in" ? await auth.getIdTokenClaims().catch(() => null) : null;
      const claim = claims?.["imp"];
      if (active) setSessionId(typeof claim === "string" && claim !== "" ? claim : null);
    };
    void read();
    return () => {
      active = false;
    };
  }, [auth, state]);
  return sessionId;
};

/**
 * Banner of the user area while the tab is signed in as an impersonated user (the ID token carries
 * `imp`, SP1 spec §6.6): the access is read-only and audited, until when it lasts (known when this
 * tab started the session) and a sign-out that ends it here. The region stays mounted so the
 * notice is announced when it appears; empty otherwise.
 */
export function ImpersonationBanner({ className }: { className?: string }) {
  const t = useTranslations("admin.impersonation.banner");
  const formatDateTime = useFormatDateTime();
  const sessionId = useImpersonationClaim();
  const stored = useStoredImpersonation();
  const expiresAt = stored !== null && stored.sessionId === sessionId ? stored.expiresAt : undefined;
  return (
    <div aria-live="polite" aria-atomic="true" data-slot="impersonation-banner" className={className}>
      {sessionId === null ? null : (
        <Alert variant="warning" role={undefined} className="items-center">
          <Icon name="eye" />
          <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2 text-inherit">
            <span>{expiresAt === undefined ? t("message") : t("messageUntil", { when: formatDateTime(expiresAt) })}</span>
            <SignOutButton size="sm">{t("signOut")}</SignOutButton>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
