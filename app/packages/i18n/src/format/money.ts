/** Money as it travels in the API (`contracts/api.md` §8.2): integer minor units + ISO 4217 code. */
export type MoneyValue = { amountMinor: number; currency: string };

/** Minor digits of a currency as `Intl` knows them (BRL 2, JPY 0, KWD 3); never a hand-kept table. */
export const currencyMinorDigits = (currency: string): number =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;

/**
 * Decimal string of a minor-unit integer (`12345`, 2 → `"123.45"`). Built from digits, not by
 * dividing, so large amounts keep every cent; `Intl.NumberFormat.format` accepts decimal strings.
 */
const toDecimalString = (amountMinor: number, digits: number): `${number}` => {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("amountMinor must be a safe integer");
  const sign = amountMinor < 0 ? "-" : "";
  const magnitude = String(Math.abs(amountMinor));
  if (digits === 0) return `${sign}${magnitude}` as `${number}`;
  const padded = magnitude.padStart(digits + 1, "0");
  return `${sign}${padded.slice(0, -digits)}.${padded.slice(-digits)}` as `${number}`;
};

export type FormatMoneyOptions = {
  /** `symbol` (default, `R$`), `code` (`BRL`) or `name` (`reais brasileiros`). */
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
};

export const formatMoney = (money: MoneyValue, locale: string, options: FormatMoneyOptions = {}): string => {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    currencyDisplay: options.currencyDisplay ?? "symbol",
  });
  const digits = currencyMinorDigits(money.currency);
  return formatter.format(toDecimalString(money.amountMinor, digits));
};
