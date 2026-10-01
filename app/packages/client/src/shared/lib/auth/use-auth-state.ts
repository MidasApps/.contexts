"use client";

import { useSyncExternalStore } from "react";
import { useAuth } from "./auth-context.tsx";
import type { AuthState } from "./auth-port.ts";

/** Current auth state; `loading` until Firebase reports the first user. */
export const useAuthState = (): AuthState => {
  const auth = useAuth();
  return useSyncExternalStore(auth.subscribe, auth.getState, auth.getState);
};
