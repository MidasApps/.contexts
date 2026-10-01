"use client";

import { createContext, use, type ReactNode } from "react";
import type { SessionController } from "./session-state.ts";

const SessionContext = createContext<SessionController | null>(null);

/** Mounted by the app shell's `SessionProvider`; tests mount it with a hand-made controller. */
export function SessionContextProvider({ session, children }: { session: SessionController; children: ReactNode }) {
  return <SessionContext value={session}>{children}</SessionContext>;
}

/**
 * The session state and its actions (sign-in completion, MFA, sign-out).
 * @throws {Error} outside the app shell's session provider (a composition bug).
 */
export const useSession = (): SessionController => {
  const session = use(SessionContext);
  if (session === null) throw new Error("useSession must be used inside SessionProvider");
  return session;
};
