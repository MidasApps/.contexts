"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "use-intl";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { ADMIN_SURFACE_ROUTE_IDS, type Route } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

const SIGN_IN: Route = { id: "sign-in" };
// Signing out of the administration comes back to it after the next sign-in (decision 0077).
const SIGN_IN_TO_ADMINISTRATION: Route = { id: "sign-in", next: "/admin" };

const signInFor = (locationPath: string): Route => {
  const route = parseRoute(locationPath);
  return route !== null && ADMIN_SURFACE_ROUTE_IDS.has(route.id) ? SIGN_IN_TO_ADMINISTRATION : SIGN_IN;
};

/**
 * Signs out (SP1 spec §3.3 step 5): the session provider ends the server session, clears the
 * query cache and UI stores and signs Firebase out, even when the server call fails (then a
 * warning says the other devices may still be signed in). Lands on `landing`: by default sign-in,
 * which leads back to the administration when signing out from it; `null` stays (the page renders
 * its signed-out state, e.g. the invitation asks for another account).
 */
export const useSignOut = (landing?: Route | null): { signOut: () => Promise<void>; pending: boolean } => {
  const t = useTranslations("auth.signOut");
  const session = useSession();
  const router = useRouter();
  const destination = landing === undefined ? signInFor(router.useLocationPath()) : landing;
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
      if (destination !== null) router.navigate(destination, { replace: true });
    }
  }, [session, router, t, destination]);
  return { signOut, pending };
};
