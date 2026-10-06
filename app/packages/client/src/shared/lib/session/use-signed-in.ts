"use client";

import { useSession } from "./session-context.tsx";

/** `true` once the session is signed in: server-state hooks enable their queries with it. */
export const useIsSignedIn = (): boolean => useSession().state.status === "signed-in";
