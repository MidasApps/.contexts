"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ActionDispatch, useCallback } from "react";
import type { AuthPort } from "#/shared/lib/auth/auth-port.ts";
import type { SessionController } from "#/shared/lib/session/session-state.ts";
import {
  ImpersonationUnsupportedError,
  type SessionBridgePort,
} from "#/shared/lib/session-bridge/session-bridge-port.ts";
import { waitForSignedInUid } from "./session-effects.ts";
import type { SessionEvent } from "./session-machine.ts";

/**
 * Support access in the same tab (decision 0047): the server session enters or leaves an
 * impersonation and hands back the custom token of the account the tab now runs as. Nothing the
 * previous account cached survives the switch.
 */
export const useImpersonationSwitch = (args: {
  auth: AuthPort;
  sessionBridge: SessionBridgePort;
  dispatch: ActionDispatch<[SessionEvent]>;
}): Pick<SessionController, "enterImpersonation" | "leaveImpersonation"> => {
  const { auth, sessionBridge, dispatch } = args;
  const queryClient = useQueryClient();

  const switchUser = useCallback(
    async (customToken: string) => {
      await auth.signInWithCustomToken(customToken);
      queryClient.clear();
      dispatch({ type: "USER_SWITCHED", uid: await waitForSignedInUid(auth) });
    },
    [auth, queryClient, dispatch],
  );

  const enterImpersonation = useCallback(
    async (impersonationSessionId: string) => {
      if (sessionBridge.enterImpersonation === undefined) throw new ImpersonationUnsupportedError();
      await switchUser((await sessionBridge.enterImpersonation({ impersonationSessionId })).customToken);
    },
    [sessionBridge, switchUser],
  );

  // Leaving only ends the impersonation on the server; the caller then loads `/admin` as a new
  // document, whose session exchange signs the staff account in. Switching the Firebase user in
  // place made the still-mounted user area refetch the user's organization as staff (404s seen in
  // the e2e) before the navigation landed.
  const leaveImpersonation = useCallback(async () => {
    if (sessionBridge.leaveImpersonation === undefined) throw new ImpersonationUnsupportedError();
    await sessionBridge.leaveImpersonation();
  }, [sessionBridge]);

  return { enterImpersonation, leaveImpersonation };
};
