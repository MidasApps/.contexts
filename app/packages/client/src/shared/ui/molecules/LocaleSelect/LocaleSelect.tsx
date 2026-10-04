"use client";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@core/i18n";
import type { ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";

/** Language name written in that language ("Português (Brasil)"), capitalized for its own locale. */
export const endonym = (tag: string): string => {
  const name = new Intl.DisplayNames([tag], { type: "language", languageDisplay: "standard" }).of(tag) ?? tag;
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
};

export type LocaleSelectProps = Omit<ComponentProps<typeof SelectTrigger>, "children"> & {
  value: SupportedLocale;
  onValueChange: (locale: SupportedLocale) => void;
  locales?: readonly SupportedLocale[];
};

const isLocaleOf = (locales: readonly SupportedLocale[], value: string): value is SupportedLocale =>
  (locales as readonly string[]).includes(value);

/**
 * Language picker (rules/internationalization.md: always visible, never header-only): each
 * language in its own language with a matching `lang` attribute, no flags (a flag is a country,
 * not a language). Label it from outside (`FieldLabel`/`Label` → trigger id).
 */
export function LocaleSelect({
  value,
  onValueChange,
  locales = SUPPORTED_LOCALES,
  ...triggerProps
}: LocaleSelectProps) {
  const t = useTranslations("common.pickers.locale");
  return (
    <Select value={value} onValueChange={(next) => isLocaleOf(locales, next) && onValueChange(next)}>
      <SelectTrigger className="min-w-48" {...triggerProps}>
        <SelectValue placeholder={t("placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {locales.map((tag) => (
          <SelectItem key={tag} value={tag} lang={tag}>
            {endonym(tag)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
