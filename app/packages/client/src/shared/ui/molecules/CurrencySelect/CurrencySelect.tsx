"use client";

import { listCurrencies } from "@core/i18n";
import { useMemo, type ComponentProps } from "react";
import { useLocale, useTranslations } from "use-intl";
import { Combobox } from "#/shared/ui/molecules/Combobox/Combobox.tsx";

export type CurrencySelectProps = Omit<
  ComponentProps<typeof Combobox>,
  "groups" | "placeholder" | "searchLabel" | "emptyText" | "searchPlaceholder"
>;

/** "BRL — Real brasileiro": how the picker names a currency, also used where a currency is only shown. */
export const currencyLabel = (code: string, locale: string): string => `${code} — ${new Intl.DisplayNames([locale], { type: "currency", fallback: "code" }).of(code) ?? code}`;

/**
 * ISO 4217 currency picker (codes from `Intl.supportedValuesOf`, names in the UI locale). Search
 * matches the code or the localized name. Value is the code (`BRL`).
 */
export function CurrencySelect(props: CurrencySelectProps) {
  const locale = useLocale();
  const t = useTranslations("common.pickers.currency");
  const groups = useMemo(
    () => [
      {
        options: listCurrencies(locale).map(({ code, name }) => ({ value: code, label: currencyLabel(code, locale), keywords: [code, name] })),
      },
    ],
    [locale],
  );
  return (
    <Combobox
      groups={groups}
      placeholder={t("placeholder")}
      searchLabel={t("search")}
      searchPlaceholder={t("search")}
      emptyText={t("empty")}
      {...props}
    />
  );
}
