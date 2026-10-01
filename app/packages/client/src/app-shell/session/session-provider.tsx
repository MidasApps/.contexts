"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useReducer, type ReactNode } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { AuthError, type MfaChallenge } from "#/shared/lib/auth/auth-port.ts";
import type { SessionBridgePort } from "#/shared/lib/session-bridge/session-bridge-port.ts";
import { SessionContextProvider } from "#/shared/lib/session/session-context.tsx";
import type { SessionController } from "#/shared/lib/session/session-state.ts";
import { useAuthLossWatch, useClaimsFreshness, useSessionBoot, waitForSignedInUid, type ReportError } from "./session-effects.ts";
import { INITIAL_SESSION_STATE, sessionReducer } from "./session-machine.ts";
import { useImpersonationSwitch } from "./use-impersonation-switch.ts";

export type SessionProviderProps = {
  sessionBridge: SessionBridgePort;
  reportError: ReportError;
  /** Resets client stores that must not survive the user (shell UI store). */
  onSignedOut: () => void;
  children: ReactNode;
};

/**
 * Owns the session lifecycle (SP2 Task 10): resumes a stored session on boot, completes interactive
 * sign-ins through the session bridge, keeps claims fresh (`accessVersion`) and signs out
 * everywhere it must (bridge, Firebase, query cache, UI stores). Views read it with `useSession()`.
 */
export function SessionProvider({ sessionBridge, reportError, onSignedOut, children }: SessionProviderProps) {
  const auth = useAuth();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(sessionReducer, INITIAL_SESSION_STATE);

  const endLocally = useCallback(() => {
    queryClient.clear();
    onSignedOut();
    dispatch({ type: "SIGNED_OUT" });
  }, [queryClient, onSignedOut]);

  useSessionBoot({ auth, sessionBridge, dispatch, reportError });
  useAuthLossWatch({ auth, state, onLost: endLocally });
  useClaimsFreshness({ auth, callEndpoint, signedIn: state.status === "signed-in", reportError });

  const completeSignIn = useCallback(async () => {
    const idToken = await auth.getIdToken({ forceRefresh: false });
    if (idToken === null) throw new AuthError("NOT_SIGNED_IN");
    try {
      await sessionBridge.establish({ idToken });
    } catch (error: unknown) {
      await auth.signOut();
      throw error;
    }
    dispatch({ type: "SIGNED_IN", uid: await waitForSignedInUid(auth) });
  }, [auth, sessionBridge]);

  const signOut = useCallback(async () => {
    try {
      await sessionBridge.end();
    } finally {
      endLocally();
      await auth.signOut();
    }
  }, [auth, sessionBridge, endLocally]);

  const { enterImpersonation, leaveImpersonation } = useImpersonationSwitch({ auth, sessionBridge, dispatch });

  const controller = useMemo<SessionController>(
    () => ({
      state,
      completeSignIn,
      requireMfa: (challenge: MfaChallenge) => dispatch({ type: "MFA_REQUIRED", challenge }),
      cancelMfa: () => dispatch({ type: "MFA_CANCELLED" }),
      signOut,
      enterImpersonation,
      leaveImpersonation,
    }),
    [state, completeSignIn, signOut, enterImpersonation, leaveImpersonation],
  );
  return <SessionContextProvider session={controller}>{children}</SessionContextProvider>;
}
