export type AvatarTone = "violet" | "emerald" | "amber" | "blue" | "neutral";

const HASHED_TONES: readonly AvatarTone[] = ["violet", "emerald", "amber", "blue"];

/** Stable tone per name (avatar.html: the same person always gets the same colour). */
export const avatarToneFor = (name: string): AvatarTone => {
  let hash = 0;
  for (const char of name.trim().toLocaleLowerCase("en-US")) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return HASHED_TONES[hash % HASHED_TONES.length] ?? "neutral";
};

/**
 * Two uppercase initials (avatar.html: always two characters): first and last word, or the first
 * two letters of a single word. Works per grapheme so accented and non-Latin names stay intact.
 */
export const initialsOf = (name: string): string => {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");
  const letters = (word: string | undefined): string[] =>
    Array.from(new Intl.Segmenter().segment(word ?? ""), (s) => s.segment);
  const [first, ...rest] = words;
  const picked = rest.length > 0 ? [letters(first)[0], letters(rest.at(-1))[0]] : letters(first).slice(0, 2);
  return picked.join("").toLocaleUpperCase();
};
