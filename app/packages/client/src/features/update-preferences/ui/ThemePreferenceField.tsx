"use client";

import { useId } from "react";
import { useTranslations } from "use-intl";
import { THEME_PREFERENCES, type ThemePreference } from "#/shared/lib/theme/theme-provider.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "#/shared/ui/atoms/RadioGroup/RadioGroup.tsx";
import { FieldDescription, FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import { useSaveThemePreference } from "../model/use-save-theme-preference.ts";

const ICONS: Record<ThemePreference, IconName> = { system: "monitor", light: "sun", dark: "moon" };

const isThemePreference = (value: string): value is ThemePreference =>
  (THEME_PREFERENCES as readonly string[]).includes(value);

/**
 * Theme choice (system, light, dark) as a segmented radio group (formularios.html): applied as
 * soon as it is picked (no save button), persisted to the profile in the background.
 */
export function ThemePreferenceField() {
  const t = useTranslations("profile.preferences.theme");
  const id = useId();
  const theme = useSaveThemePreference();
  return (
    <FieldSet>
      <FieldLegend>{t("legend")}</FieldLegend>
      <FieldDescription>{t("description")}</FieldDescription>
      <RadioGroup
        value={theme.preference}
        onValueChange={(value) => isThemePreference(value) && theme.save(value)}
        className="grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {THEME_PREFERENCES.map((preference) => (
          <Label
            key={preference}
            htmlFor={`${id}-${preference}`}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 font-normal has-[[data-state=checked]]:border-sidebar-primary has-[[data-state=checked]]:bg-accent"
          >
            <RadioGroupItem id={`${id}-${preference}`} value={preference} />
            <Icon name={ICONS[preference]} className="size-4 text-muted-foreground" />
            {t(`options.${preference}`)}
          </Label>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
