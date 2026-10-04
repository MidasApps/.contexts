"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Theme for both apps (decision 0014): `next-themes` writes `data-theme="light|dark"` on
 * `<html>` (the tokens in `globals.css` key off it), follows `prefers-color-scheme` by default and
 * remembers the choice in local storage (a UI preference, not server state). Pass the CSP nonce
 * on web so its pre-paint script is allowed (decision 0016). The pre-paint script only matters in
 * server-rendered HTML; a client-rendered host (desktop) passes `prePaintScript={false}`, which marks
 * it as a data block so React does not warn that a client-rendered script never runs.
 */
export function ThemeProvider({
  children,
  nonce,
  prePaintScript = true,
}: {
  children: ReactNode;
  nonce?: string | undefined;
  prePaintScript?: boolean;
}) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      themes={["light", "dark"]}
      disableTransitionOnChange
      {...(nonce === undefined ? {} : { nonce })}
      {...(prePaintScript ? {} : { scriptProps: { type: "application/json" } })}
    >
      {children}
    </NextThemesProvider>
  );
}
