"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, type ActionDispatch } from "react";
import type { AuthPort } from "#/shared/lib/auth/auth-port.ts";
import { ImpersonationUnsupportedError, type SessionBridgePort } from "#/shared/lib/session-bridge/session-bridge-port.ts";
import type { SessionController } from "#/shared/lib/session/session-state.ts";
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

  const leaveImpersonation = useCallback(async () => {
    if (sessionBridge.leaveImpersonation === undefined) throw new ImpersonationUnsupportedError();
    await switchUser((await sessionBridge.leaveImpersonation()).customToken);
  }, [sessionBridge, switchUser]);

  return { enterImpersonation, leaveImpersonation };
};
