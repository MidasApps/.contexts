"use client";

import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void): (() => void) => {
  globalThis.addEventListener("online", listener);
  globalThis.addEventListener("offline", listener);
  return () => {
    globalThis.removeEventListener("online", listener);
    globalThis.removeEventListener("offline", listener);
  };
};

// Server renders assume online, so hydration never flashes the banner.
const isOnline = (): boolean => globalThis.navigator.onLine;
const assumeOnline = (): boolean => true;

/** `navigator.onLine` with its `online`/`offline` events (SP2 spec §9). */
export const useOnlineStatus = (): boolean => useSyncExternalStore(subscribe, isOnline, assumeOnline);
