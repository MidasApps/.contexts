const MICRO_PER_USD = 1_000_000;
/** `ModelPriceInputSchema`: the highest price the API takes, in micro-USD. */
const MAX_PRICE_MICRO_USD = 1_000_000_000_000;
/** Micro-USD resolution: one millionth of a dollar. */
const FRACTION_DIGITS = 6;

/** Decimal and group separators of the locale, read from `Intl` (never assumed). */
const separatorsOf = (locale: string): { decimal: string; group: string } => {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? ",",
  };
};

/**
 * A price per 1M tokens typed in USD in the locale's format ("0,075" in pt-BR) to integer micro-USD,
 * or `null` when it is not a non-negative amount. Up to six decimals: per-token prices are often
 * below a cent, so a money field (two decimals) would round them away.
 */
export const parseUsdPriceText = (text: string, locale: string): number | null => {
  const { decimal, group } = separatorsOf(locale);
  const cleaned = text.replace(/\s/gu, "").split(group).join("");
  const [whole = "", fraction = "", ...rest] = cleaned.split(decimal);
  if (rest.length > 0 || !/^\d+$/u.test(whole) || !/^\d*$/u.test(fraction) || fraction.length > FRACTION_DIGITS)
    return null;
  const micro = Number(whole) * MICRO_PER_USD + Number(fraction.padEnd(FRACTION_DIGITS, "0"));
  return Number.isSafeInteger(micro) && micro <= MAX_PRICE_MICRO_USD ? micro : null;
};

/** Editable text of a micro-USD price per 1M tokens: two to six decimals, no currency symbol. */
export const formatUsdPriceText = (microUsd: number, locale: string): string =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: FRACTION_DIGITS }).format(
    microUsd / MICRO_PER_USD,
  );
