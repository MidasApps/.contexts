import { match } from "@formatjs/intl-localematcher";
import { isSupportedLocale, SUPPORTED_LOCALES, type SupportedLocale } from "./locales.ts";

export type NegotiateLocaleInput = {
  /** Requested tags in preference order (`Accept-Language`, `navigator.languages`). */
  requested: readonly string[];
  /** Explicit choice (profile preference or the cookie mirroring it); wins when supported, any case. */
  saved?: string | undefined;
  fallback: SupportedLocale;
};

const canonicalTags = (tags: readonly string[]): string[] =>
  tags.flatMap((tag) => {
    try {
      return Intl.getCanonicalLocales(tag);
    } catch {
      // RangeError: malformed tag from a header or browser; skip it.
      return [];
    }
  });

/**
 * Picks the effective locale (rules/internationalization.md "Locale negotiation"): the URL segment is
 * handled by the router before this; here a saved choice beats the requested list, and the
 * requested list is matched with RFC 4647 best fit (`es-MX` → `es-419`, `pt` → `pt-BR`).
 */
export const negotiateLocale = ({ requested, saved, fallback }: NegotiateLocaleInput): SupportedLocale => {
  const [savedTag] = saved === undefined ? [] : canonicalTags([saved]);
  if (savedTag !== undefined && isSupportedLocale(savedTag)) return savedTag;
  const tags = canonicalTags(requested);
  if (tags.length === 0) return fallback;
  for (const tag of tags) {
    const matched = match([tag], SUPPORTED_LOCALES, "und", { algorithm: "best fit" });
    if (isSupportedLocale(matched)) return matched;
  }
  return fallback;
};
