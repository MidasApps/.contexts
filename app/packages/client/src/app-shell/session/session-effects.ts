"use client";

import { syncClaimsEndpoint } from "@core/contracts";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ActionDispatch, useEffect, useRef } from "react";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { meQuery } from "#/shared/api/core-queries.ts";
import { AuthError, type AuthPort } from "#/shared/lib/auth/auth-port.ts";
import type { SessionState } from "#/shared/lib/session/session-state.ts";
import type { SessionBridgePort } from "#/shared/lib/session-bridge/session-bridge-port.ts";
import type { SessionEvent } from "./session-machine.ts";

/** Reports failures the shell handles itself (claims sync, boot); the apps pass their logger. */
export type ReportError = (error: unknown, context: { readonly operation: string }) => void;

const SIGN_IN_WAIT_MS = 10_000;

/**
 * The uid once Firebase reports the signed-in user (its state store may lag the sign-in promise).
 * @throws {AuthError} `NOT_SIGNED_IN` when no user appears within 10 s.
 */
export const waitForSignedInUid = (auth: AuthPort): Promise<string> =>
  new Promise((resolve, reject) => {
    const current = auth.getState();
    if (current.status === "signed-in") return resolve(current.user.uid);
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new AuthError("NOT_SIGNED_IN"));
    }, SIGN_IN_WAIT_MS);
    const unsubscribe = auth.subscribe(() => {
      const next = auth.getState();
      if (next.status !== "signed-in") return;
      clearTimeout(timer);
      unsubscribe();
      resolve(next.user.uid);
    });
  });

const resumeSession = async (args: {
  auth: AuthPort;
  sessionBridge: SessionBridgePort;
  dispatch: ActionDispatch<[SessionEvent]>;
}): Promise<void> => {
  const restored = await args.sessionBridge.restore();
  if (restored === null) return args.dispatch({ type: "NO_SESSION" });
  args.dispatch({ type: "SESSION_FOUND" });
  await args.auth.signInWithCustomToken(restored.customToken);
  args.dispatch({ type: "EXCHANGE_SUCCEEDED", uid: await waitForSignedInUid(args.auth) });
};

/**
 * On boot: `sessionBridge.restore()` → custom token → `signInWithCustomToken`. Runs once per
 * provider (a desktop restore rotates its secret, so a StrictMode re-run must not repeat it).
 */
export const useSessionBoot = (args: {
  auth: AuthPort;
  sessionBridge: SessionBridgePort;
  dispatch: ActionDispatch<[SessionEvent]>;
  reportError: ReportError;
}): void => {
  const started = useRef(false);
  const { auth, sessionBridge, dispatch, reportError } = args;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    resumeSession({ auth, sessionBridge, dispatch }).catch((error: unknown) => {
      reportError(error, { operation: "session_resume" });
      dispatch({ type: "EXCHANGE_FAILED" });
    });
  }, [auth, sessionBridge, dispatch, reportError]);
};

/** Firebase lost the user while the session was signed in (revoked or expired refresh): sign out locally. */
export const useAuthLossWatch = (args: { auth: AuthPort; state: SessionState; onLost: () => void }): void => {
  const { auth, state, onLost } = args;
  useEffect(() => {
    if (state.status !== "signed-in") return undefined;
    return auth.subscribe(() => {
      if (auth.getState().status === "signed-out") onLost();
    });
  }, [auth, state.status, onLost]);
};

const syncStaleClaims = async (args: {
  auth: AuthPort;
  callEndpoint: CallEndpoint;
  queryClient: QueryClient;
  accessVersion: number;
}): Promise<void> => {
  const claims = await args.auth.getIdTokenClaims();
  const tokenVersion = typeof claims?.accessVersion === "number" ? claims.accessVersion : -1;
  if (tokenVersion >= args.accessVersion) return;
  await args.callEndpoint(syncClaimsEndpoint, {});
  await args.auth.getIdToken({ forceRefresh: true });
  await args.queryClient.invalidateQueries({ queryKey: ["organizations"] });
};

/**
 * SP1 spec §5.4: when `GET /v1/me` reports a newer `accessVersion` than the ID token's claim, call
 * `POST /v1/me/claims/sync`, force a token refresh and refetch tenant data. Once per version.
 */
export const useClaimsFreshness = (args: {
  auth: AuthPort;
  callEndpoint: CallEndpoint;
  signedIn: boolean;
  reportError: ReportError;
}): void => {
  const { auth, callEndpoint, signedIn, reportError } = args;
  const queryClient = useQueryClient();
  const me = useQuery({ ...meQuery(callEndpoint), enabled: signedIn });
  const checked = useRef<number | null>(null);
  const accessVersion = me.data?.accessVersion;
  useEffect(() => {
    if (accessVersion === undefined || checked.current === accessVersion) return;
    checked.current = accessVersion;
    syncStaleClaims({ auth, callEndpoint, queryClient, accessVersion }).catch((error: unknown) => {
      checked.current = null;
      reportError(error, { operation: "claims_sync" });
    });
  }, [accessVersion, auth, callEndpoint, queryClient, reportError]);
};
