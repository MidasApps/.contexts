import { currencyMinorDigits, type MoneyValue } from "@core/i18n";

/** `12345`, 2 digits → `"123.45"`; digit arithmetic keeps large amounts exact. */
const toDecimalString = (amountMinor: number, digits: number): `${number}` => {
  const magnitude = String(Math.abs(amountMinor)).padStart(digits + 1, "0");
  const sign = amountMinor < 0 ? "-" : "";
  return (digits === 0 ? `${sign}${magnitude}` : `${sign}${magnitude.slice(0, -digits)}.${magnitude.slice(-digits)}`) as `${number}`;
};

/**
 * Editable text for a money value in the user's locale, without the currency symbol (the
 * currency is shown next to the field): `{ 123456, BRL }` in pt-BR → `"1.234,56"`.
 */
export const formatMoneyInputText = (money: MoneyValue, locale: string): string => {
  const digits = currencyMinorDigits(money.currency);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    toDecimalString(money.amountMinor, digits),
  );
};
