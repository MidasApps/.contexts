"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Breakpoints of `.design-system/breakpoints.html` (mirrors `--breakpoint-*` in globals.css). */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/**
 * Subscribes to a media query (`useSyncExternalStore`, no effect-driven state). The server snapshot
 * is `false`, so SSR renders the desktop-first markup and the client corrects on hydration.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
};

/** Below `md` (768 px): the sidebar becomes a sheet (SP2 spec §9). */
export const useIsMobile = (): boolean => useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`);
