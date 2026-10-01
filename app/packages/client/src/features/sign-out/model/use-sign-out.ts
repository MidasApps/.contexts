"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "use-intl";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

const SIGN_IN: Route = { id: "sign-in" };

/**
 * Signs out (SP1 spec §3.3 step 5): the session provider ends the server session, clears the
 * query cache and UI stores and signs Firebase out, even when the server call fails (then a
 * warning says the other devices may still be signed in). Lands on sign-in unless `landing` is
 * `null` (stay: the page renders its signed-out state, e.g. the invitation asks for another account).
 */
export const useSignOut = (landing: Route | null = SIGN_IN): { signOut: () => Promise<void>; pending: boolean } => {
  const t = useTranslations("auth.signOut");
  const session = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await session.signOut();
    } catch {
      // The local session is already gone (the provider signs out in `finally`); only the server
      // record may survive, which the warning explains.
      notify.warning(t("failed"));
    } finally {
      setPending(false);
      if (landing !== null) router.navigate(landing, { replace: true });
    }
  }, [session, router, t, landing]);
  return { signOut, pending };
};
