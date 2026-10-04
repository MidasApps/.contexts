"use client";

import { useEffect, useState } from "react";
import { isImpersonationOpen, type StoredImpersonation, useImpersonationStore } from "./use-impersonation-store.ts";

const TICK_MS = 30_000;

/**
 * The impersonation session this tab started, while it has not expired (`null` otherwise). Reads
 * `sessionStorage` after mount and re-checks the expiry twice a minute.
 */
export const useStoredImpersonation = (): StoredImpersonation | null => {
  const session = useImpersonationStore((state) => state.session);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void useImpersonationStore.persist.rehydrate();
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return isImpersonationOpen(session, now) ? session : null;
};
