import { MAX_SEARCH_TOKENS } from "@core/contracts";

/** Firestore `array-contains-any` accepts at most 30 values. */
export const MAX_QUERY_TOKENS = 30;
const MIN_TOKEN_CHARS = 2;
const MAX_TOKEN_CHARS = 64;

// Combining marks left by NFD: "ação" → "acao" (accent folding).
const COMBINING_MARKS = /\p{M}+/gu;
const NON_WORD = /[^\p{L}\p{N}]+/u;

const wordsOf = (text: string): string[] =>
  text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .split(NON_WORD)
    .filter((word) => word.length >= MIN_TOKEN_CHARS)
    .map((word) => word.slice(0, MAX_TOKEN_CHARS));

const distinct = (words: readonly string[], cap: number): string[] => [...new Set(words)].slice(0, cap);

/**
 * Search tokens of a conversation (spec §4.1, decision 0033): lower-case, accent-folded words of
 * the title and the summary, distinct, at most 50, title words first.
 */
export const buildSearchTokens = (input: {
  readonly title: string | null;
  readonly summary: string | null;
}): string[] => distinct([...wordsOf(input.title ?? ""), ...wordsOf(input.summary ?? "")], MAX_SEARCH_TOKENS);

/** Tokens of a search query `q`, folded the same way (at most 30, the `array-contains-any` cap). */
export const queryTokens = (q: string): string[] => distinct(wordsOf(q), MAX_QUERY_TOKENS);
