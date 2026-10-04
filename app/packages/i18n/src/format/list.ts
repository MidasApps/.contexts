export type FormatListOptions = {
  locale: string;
  type?: Intl.ListFormatType;
  style?: Intl.ListFormatStyle;
};

/** Prose list ("A, B e C") via `Intl.ListFormat`; never joined by hand. */
export const formatList = (
  items: readonly string[],
  { locale, type = "conjunction", style = "long" }: FormatListOptions,
): string => new Intl.ListFormat(locale, { type, style }).format(items);
