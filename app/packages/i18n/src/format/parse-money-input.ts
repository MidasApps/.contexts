import { currencyMinorDigits } from "./money.ts";

export type ParseMoneyInputError = "INVALID_MONEY_INPUT" | "TOO_MANY_FRACTION_DIGITS";
export type ParseMoneyInputResult =
  | { ok: true; amountMinor: number }
  | { ok: false; error: ParseMoneyInputError };

type Separators = { group: string; decimal: string; currencyLiterals: string[] };

const SPACES = /[\s\u00a0\u202f]/g;

/** Group/decimal separators and currency symbols of the locale, read from `Intl` (never assumed). */
const readSeparators = (locale: string, currency: string): Separators => {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(1234567.891);
  const find = (type: Intl.NumberFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value.replace(SPACES, " ") ?? "";
  const currencyLiterals = [find("currency"), currency].filter((literal) => literal !== "");
  return { group: find("group"), decimal: find("decimal") || ".", currencyLiterals };
};

const invalid = (error: ParseMoneyInputError = "INVALID_MONEY_INPUT"): ParseMoneyInputResult => ({ ok: false, error });

/** First group 1–3 digits, then groups of exactly 3 (`1.234.567`); rejects `1234.56` in pt-BR. */
const isWellGrouped = (integerPart: string, group: string): boolean => {
  if (group === "" || !integerPart.includes(group)) return /^\d+$/.test(integerPart);
  const [head = "", ...rest] = integerPart.split(group);
  return /^\d{1,3}$/.test(head) && rest.every((chunk) => /^\d{3}$/.test(chunk));
};

const stripCurrencyAndSpaces = (text: string, literals: readonly string[]): string => {
  let cleaned = text.replace(SPACES, " ");
  for (const literal of literals) cleaned = cleaned.split(literal).join("");
  return cleaned.replace(/ /g, "");
};

/**
 * Parses what a user typed in a money field into integer minor units, using the locale's
 * separators (rules/internationalization.md "Formulários e input"). Negative amounts are not
 * accepted: `MoneySchema.amountMinor` is non-negative.
 */
export const parseMoneyInput = (text: string, locale: string, currency: string): ParseMoneyInputResult => {
  const { group, decimal, currencyLiterals } = readSeparators(locale, currency);
  const groupToken = group === " " ? "" : group;
  const cleaned = stripCurrencyAndSpaces(text, currencyLiterals);
  if (cleaned === "") return invalid();
  const pieces = cleaned.split(decimal);
  if (pieces.length > 2) return invalid();
  const [integerPart = "", fractionPart = ""] = pieces;
  if (integerPart === "" || !isWellGrouped(integerPart, groupToken)) return invalid();
  if (!/^\d*$/.test(fractionPart)) return invalid();
  const digits = currencyMinorDigits(currency);
  if (fractionPart.length > digits) return invalid("TOO_MANY_FRACTION_DIGITS");
  const integerDigits = groupToken === "" ? integerPart : integerPart.split(groupToken).join("");
  const amountMinor = Number(`${integerDigits}${fractionPart.padEnd(digits, "0")}`);
  return Number.isSafeInteger(amountMinor) ? { ok: true, amountMinor } : invalid();
};
