"use client";

import { useEffect, useRef } from "react";
import { useMe } from "#/entities/session/index.ts";
import { useThemePreference } from "#/shared/lib/theme/use-theme-preference.ts";

/**
 * Applies the profile's saved theme once per signed-in user (the profile wins over what this
 * device remembered, so a choice made elsewhere follows the user). Later changes go through
 * `useSaveThemePreference`, which updates both. Renders nothing; the app shell mounts it.
 */
export function ProfileThemeSync() {
  const me = useMe();
  const { preference, setPreference } = useThemePreference();
  const appliedFor = useRef<string | null>(null);
  const saved = me.data?.preferences.theme;
  const uid = me.data?.uid;
  useEffect(() => {
    if (uid === undefined || saved === undefined || appliedFor.current === uid) return;
    appliedFor.current = uid;
    if (saved !== preference) setPreference(saved);
  }, [uid, saved, preference, setPreference]);
  return null;
}
