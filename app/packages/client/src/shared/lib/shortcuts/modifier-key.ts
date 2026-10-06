"use client";

import { useSyncExternalStore } from "react";

type NavigatorWithUaData = Navigator & { userAgentData?: { platform?: string } };

/** macOS/iOS use ⌘ for app shortcuts; every other platform uses Ctrl (atalhos.html). */
export const isApplePlatform = (navigator: NavigatorWithUaData | undefined = globalThis.navigator): boolean => {
  const platform = navigator?.userAgentData?.platform ?? navigator?.platform ?? "";
  return /mac|iphone|ipad|ipod/iu.test(platform);
};

const subscribe = (): (() => void) => () => undefined;
const clientSnapshot = (): boolean => isApplePlatform();
// Server renders (and the hydration pass) show "Ctrl"; the client corrects it right after.
const serverSnapshot = (): boolean => false;

/**
 * The modifier of ⌘/Ctrl shortcuts for hints (`Kbd`): `"⌘"` on Apple platforms, `"Ctrl"` elsewhere,
 * with the matching `aria-keyshortcuts` value.
 */
export const useModifierKey = (): { label: string; aria: "Meta" | "Control" } => {
  const apple = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return apple ? { label: "⌘", aria: "Meta" } : { label: "Ctrl", aria: "Control" };
};
