"use client";

import { isSupportedLocale, SOURCE_LOCALE } from "@core/i18n";
import { useId } from "react";
import { useLocale, useTranslations } from "use-intl";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { LocaleSelect } from "#/shared/ui/molecules/LocaleSelect/LocaleSelect.tsx";

/**
 * Product mark and name above the entry card. The name is copy (`auth.entry.appName`), so a
 * product renames itself in its catalogs; hosts may still pass their own `brand` to the views.
 */
export function AuthBrand() {
  const t = useTranslations("auth.entry");
  return (
    <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Icon name="sparkles" className="size-4" />
      </span>
      {t("appName")}
    </span>
  );
}

export type EntryLocaleSwitcherProps = {
  /** A fragment the page read once and keeps in memory (the invitation token), kept across the switch. */
  keepHash?: string | undefined;
};

/**
 * Language picker of the signed-out pages (SH-12): before signing in there is no profile locale,
 * and the desktop has no locale in its URL, so this is the only way to leave the negotiated one.
 */
export function EntryLocaleSwitcher({ keepHash }: EntryLocaleSwitcherProps) {
  const t = useTranslations("auth.entry");
  const router = useRouter();
  const current = useLocale();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Icon name="languages" className="size-4" />
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {t("language")}
      </Label>
      <LocaleSelect
        id={id}
        size="sm"
        className="min-w-44"
        value={isSupportedLocale(current) ? current : SOURCE_LOCALE}
        onValueChange={(locale) => {
          if (locale !== current) router.switchLocale(locale, keepHash === undefined ? undefined : { hash: keepHash });
        }}
      />
    </div>
  );
}
