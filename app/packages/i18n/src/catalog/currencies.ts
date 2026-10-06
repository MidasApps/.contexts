export type CurrencyOption = { code: string; name: string };

/**
 * ISO 4217 currencies the runtime knows (`Intl.supportedValuesOf("currency")`), named in `locale`
 * and sorted with `Intl.Collator`, for currency pickers.
 */
export const listCurrencies = (locale: string): CurrencyOption[] => {
  const names = new Intl.DisplayNames([locale], { type: "currency", fallback: "code" });
  const collator = new Intl.Collator(locale);
  return Intl.supportedValuesOf("currency")
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => collator.compare(a.name, b.name));
};
