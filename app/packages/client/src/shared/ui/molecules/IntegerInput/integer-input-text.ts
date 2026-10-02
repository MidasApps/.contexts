/** Largest count the inputs accept: 15 digits stay exact as a JS number. */
const MAX_DIGITS = 15;

const groupSeparatorOf = (locale: string): string =>
  new Intl.NumberFormat(locale).formatToParts(11111).find((part) => part.type === "group")?.value ?? ",";

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Parses a whole, non-negative count typed in the user's locale: plain digits ("20000000") or
 * grouped by thousands with the locale's separator ("20.000.000" in pt-BR, "20,000,000" in
 * en-US). A separator in any other place ("1.5") is refused, so a decimal is never read as a
 * grouped integer. Returns `null` when the text is not such a count.
 */
export const parseIntegerInput = (text: string, locale: string): number | null => {
  // Intl groups with a narrow no-break space in some locales; typed text uses a plain space.
  const separator = groupSeparatorOf(locale).replace(/[  ]/gu, " ");
  const normalized = text.trim().replace(/[  ]/gu, " ");
  const grouped = new RegExp(`^\\d{1,3}(?:${escape(separator)}\\d{3})+$`, "u");
  if (!/^\d+$/u.test(normalized) && !grouped.test(normalized)) return null;
  const digits = normalized.split(separator).join("");
  return digits.replace(/^0+(?=\d)/u, "").length > MAX_DIGITS ? null : Number(digits);
};

/** `20000000` in pt-BR → `"20.000.000"`. */
export const formatIntegerInputText = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
