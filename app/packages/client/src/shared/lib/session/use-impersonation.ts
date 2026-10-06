"use client";

import { useEffect, useState } from "react";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { useAuthState } from "#/shared/lib/auth/use-auth-state.ts";

/**
 * The `imp` claim of the current ID token (SP1 spec §6.6: the impersonation session id): the id
 * while the tab is signed in as an impersonated user, `null` in a normal session, `undefined`
 * until the first read of the token answers (the admin layout mounts nothing until then).
 */
export const useImpersonationClaim = (): string | null | undefined => {
  const auth = useAuth();
  const state = useAuthState();
  const [sessionId, setSessionId] = useState<string | null | undefined>(undefined);
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
 * The `imp` claim of the current ID token, or `null` in a normal session. Read after sign-in;
 * `null` until the claims load.
 */
export const useImpersonationSessionId = (): string | null => useImpersonationClaim() ?? null;

/**
 * `true` while support staff use the app as another user: everything is read-only (the server
 * answers `IMPERSONATION_READ_ONLY`), so forms turn read-only and saves stay local.
 */
export const useIsImpersonating = (): boolean => useImpersonationSessionId() !== null;
