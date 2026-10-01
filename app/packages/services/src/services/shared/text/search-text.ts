/** Longest normalized text stored or compared (a display name holds at most 120 characters). */
const SEARCH_TEXT_MAX = 200;

/**
 * Text as prefix searches compare it (decision 0044): accents removed, lowercase, inner spaces
 * collapsed. The same function writes `users.searchName` and reads the staff search query, so
 * both sides always agree.
 * @example normalizeSearchText("  André  LIMA ") // "andre lima"
 */
export const normalizeSearchText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, SEARCH_TEXT_MAX);
