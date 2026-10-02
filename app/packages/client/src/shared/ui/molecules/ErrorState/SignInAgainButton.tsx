"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { ApiError } from "#/shared/api/api-error.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

/**
 * A `/v1` failure that means the session is gone: the HTTP client already forced one token
 * refresh and retried, so a 401 here does not heal by retrying (a revoked session, "sign out
 * everywhere" from another device).
 */
export const isSessionLost = (error: unknown): boolean => error instanceof ApiError && error.status === 401;

/**
 * "Sign in again" for a 401 that survived the token refresh (UX review U-21): ends the local
 * session (the server call may fail; the local state is cleared regardless) and opens sign-in
 * with `next` set to the current page, so the user lands back here.
 */
export function SignInAgainButton({ variant = "default" }: { variant?: ComponentProps<typeof Button>["variant"] }) {
  const t = useTranslations("common.actions");
  const session = useSession();
  const router = useRouter();
  const path = router.useLocationPath();
  const search = router.useSearch();
  const [pending, setPending] = useState(false);
  const signInAgain = async () => {
    const next = search === "" ? path : `${path}?${search}`;
    setPending(true);
    try {
      await session.signOut();
    } catch {
      // Only the server record may survive; the session provider signed out locally anyway.
    } finally {
      setPending(false);
      router.navigate({ id: "sign-in", next }, { replace: true });
    }
  };
  return (
    <Button variant={variant} pending={pending} onClick={() => void signInAgain()}>
      {t("signInAgain")}
    </Button>
  );
}
