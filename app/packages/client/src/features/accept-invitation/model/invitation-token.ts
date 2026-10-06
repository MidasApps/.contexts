"use client";

import { InvitationTokenSchema } from "@core/contracts";
import { useEffect, useState } from "react";

/** The token of an accept link (`/invite#token=<43 chars>`), or `null` when absent or malformed. */
export const readInvitationToken = (hash: string): string | null => {
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token");
  return token !== null && InvitationTokenSchema.safeParse(token).success ? token : null;
};

const currentHash = (): string => globalThis.location?.hash ?? "";

/**
 * Reads the invitation token from `location.hash` once, then removes the fragment from the address
 * bar (history `replaceState`), so the one-time secret does not stay in history, bookmarks or
 * screenshots. The fragment never reaches the server (SP1 spec §6.2); the token lives only in this
 * component's memory from here on.
 */
export const useInvitationToken = (): string | null => {
  const [token] = useState(() => readInvitationToken(currentHash()));
  useEffect(() => {
    if (currentHash() === "") return;
    const { pathname, search } = globalThis.location;
    globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${search}`);
  }, []);
  return token;
};
