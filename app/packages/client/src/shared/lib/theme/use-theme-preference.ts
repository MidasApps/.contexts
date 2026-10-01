"use client";

import { useTheme } from "next-themes";
import { THEME_PREFERENCES, type ThemePreference } from "./theme-provider.tsx";

export type ThemePreferenceState = {
  preference: ThemePreference;
  /** Theme in effect (`system` resolved); `undefined` until mounted on the client. */
  resolved: "light" | "dark" | undefined;
  setPreference: (preference: ThemePreference) => void;
};

const isPreference = (value: string | undefined): value is ThemePreference =>
  value !== undefined && (THEME_PREFERENCES as readonly string[]).includes(value);

/** The user's theme choice (profile preferences, user menu, command palette). */
export const useThemePreference = (): ThemePreferenceState => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return {
    preference: isPreference(theme) ? theme : "system",
    resolved: resolvedTheme === "light" || resolvedTheme === "dark" ? resolvedTheme : undefined,
    setPreference: setTheme,
  };
};
