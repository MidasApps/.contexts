"use client";

import { formatMoney, type MoneyValue } from "@core/i18n";
import { useLocale } from "use-intl";

/**
 * Formats `{ amountMinor, currency }` in the UI locale (decision 0013 §4), e.g. pt-BR
 * `{ 123456, "BRL" }` → "R$ 1.234,56".
 */
export const useFormatMoney = (): ((money: MoneyValue) => string) => {
  const locale = useLocale();
  return (money) => formatMoney(money, locale);
};
