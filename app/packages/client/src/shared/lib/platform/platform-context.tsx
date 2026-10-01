"use client";

import { createContext, use, type ReactNode } from "react";
import type { PlatformPort } from "./platform-port.ts";

const PlatformContext = createContext<PlatformPort | null>(null);

export function PlatformProvider({ platform, children }: { platform: PlatformPort; children: ReactNode }) {
  return <PlatformContext value={platform}>{children}</PlatformContext>;
}

/**
 * The host platform (for the few places that differ, e.g. hiding web-only `/admin` links).
 * @throws {Error} outside `PlatformProvider` (a composition bug).
 */
export const usePlatform = (): PlatformPort => {
  const platform = use(PlatformContext);
  if (platform === null) throw new Error("usePlatform must be used inside PlatformProvider");
  return platform;
};
