"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** An impersonation session this browser tab started (never the token). */
export const StoredImpersonationSchema = z.object({
  sessionId: z.string().min(1).max(200),
  expiresAt: z.iso.datetime(),
  targetUid: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(200),
});
export type StoredImpersonation = z.infer<typeof StoredImpersonationSchema>;

type ImpersonationState = {
  /** The last session started here; kept until it is ended or expires. */
  session: StoredImpersonation | null;
  start: (session: StoredImpersonation) => void;
  reset: () => void;
};

export const IMPERSONATION_STORAGE_KEY = "core.admin-impersonation";
const STORAGE_VERSION = 1;

/**
 * What staff need to open or end an impersonation session started in this tab: the session id,
 * its expiry, the user and the organization, in `sessionStorage` so it survives reloads but not
 * the tab. No token is kept: the server session mints it when the tab enters the session
 * (decision 0047). Hydrated after mount (`skipHydration`), validated before it replaces state,
 * with `reset`.
 */
export const useImpersonationStore = create<ImpersonationState>()(
  persist(
    (set) => ({
      session: null,
      start: (session) => set({ session }),
      reset: () => set({ session: null }),
    }),
    {
      name: IMPERSONATION_STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => globalThis.sessionStorage),
      partialize: (state) => ({ session: state.session }),
      // No older shape exists yet; anything from another version starts empty.
      migrate: () => ({ session: null }),
      merge: (persisted, current) => {
        const parsed = z.object({ session: StoredImpersonationSchema.nullable() }).safeParse(persisted);
        return parsed.success ? { ...current, session: parsed.data.session } : current;
      },
      skipHydration: true,
    },
  ),
);

/** `true` while the stored session can still be used or ended. */
export const isImpersonationOpen = (session: StoredImpersonation | null, now: number): session is StoredImpersonation =>
  session !== null && Date.parse(session.expiresAt) > now;
