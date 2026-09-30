/** Locales the core ships (decision 0013). Order is the display order of the language picker. */
export const SUPPORTED_LOCALES = ["pt-BR", "en-US", "es-419"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Messages are written in this locale first; it is the only catalog complete by construction. */
export const SOURCE_LOCALE: SupportedLocale = "pt-BR";

export const isSupportedLocale = (tag: string): tag is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(tag);

/** Lookup order for a message: the locale itself, then the source locale. */
export const fallbackChain = (locale: SupportedLocale): readonly SupportedLocale[] =>
  locale === SOURCE_LOCALE ? [SOURCE_LOCALE] : [locale, SOURCE_LOCALE];
