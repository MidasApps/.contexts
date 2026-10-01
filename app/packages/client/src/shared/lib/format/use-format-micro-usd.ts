"use client";

import { formatMoney, type MoneyValue } from "@core/i18n";
import { useLocale } from "use-intl";

const MICRO_PER_CENT = 10_000;
const MICRO_PER_USD = 1_000_000;

/** Model costs are stored in micro-USD (1 USD = 1 000 000): to `{ amountMinor, currency }`, rounded to the cent. */
export const microUsdToMoney = (microUsd: number): MoneyValue => ({ amountMinor: Math.round(microUsd / MICRO_PER_CENT), currency: "USD" });

/** A cap typed as money (cents) back to the API's micro-USD. */
export const moneyToMicroUsd = (money: MoneyValue): number => money.amountMinor * MICRO_PER_CENT;

/**
 * Formats a micro-USD amount in the UI locale (decision 0042). `cents` (budgets, totals) goes
 * through `{ amountMinor, currency }` + `formatMoney`; `exact` (one trace or span, usually below a
 * cent) keeps up to six fraction digits so a real cost never reads as zero.
 */
export const useFormatMicroUsd = (): ((microUsd: number, precision?: "cents" | "exact") => string) => {
  const locale = useLocale();
  return (microUsd, precision = "cents") =>
    precision === "cents"
      ? formatMoney(microUsdToMoney(microUsd), locale)
      : new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(microUsd / MICRO_PER_USD);
};
