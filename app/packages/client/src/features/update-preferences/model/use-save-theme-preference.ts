"use client";

import { useCallback } from "react";
import { useTranslations } from "use-intl";
import { useUpdateMe } from "#/entities/session/index.ts";
import { useIsImpersonating } from "#/shared/lib/session/use-impersonation.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import type { ThemePreference } from "#/shared/lib/theme/theme-provider.tsx";
import { useThemePreference } from "#/shared/lib/theme/use-theme-preference.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

/**
 * Applies a theme at once through the theme provider (it also remembers it on this device) and
 * saves it to the profile (`PATCH /v1/me`) so other devices and the next sign-in follow. A failed
 * save keeps the theme here and offers a retry. While support staff view the app as a user
 * (read-only), the theme only changes here: the profile is not theirs to change.
 */
export const useSaveThemePreference = (): { preference: ThemePreference; save: (preference: ThemePreference) => void } => {
  const t = useTranslations("profile.preferences.theme");
  const theme = useThemePreference();
  const signedIn = useIsSignedIn();
  const impersonating = useIsImpersonating();
  const updateMe = useUpdateMe();
  const { setPreference } = theme;
  const save = useCallback(
    (preference: ThemePreference) => {
      setPreference(preference);
      if (!signedIn || impersonating) return;
      const persist = (): void => {
        updateMe({ preferences: { theme: preference } }).catch(() => notify.error(t("saveFailed"), { action: { label: t("retry"), onClick: persist } }));
      };
      persist();
    },
    [impersonating, setPreference, signedIn, t, updateMe],
  );
  return { preference: theme.preference, save };
};
