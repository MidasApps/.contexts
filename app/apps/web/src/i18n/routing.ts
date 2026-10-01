import { SOURCE_LOCALE, SUPPORTED_LOCALES } from "@core/i18n";
import { defineRouting } from "next-intl/routing";

/** Cookie that remembers the UI language (decision 0013 §3: mirrors the profile preference). */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

/**
 * Web locale routing (decision 0013 §3): every page lives under `/{locale}` (`localePrefix:
 * "always"`, static per locale under Cache Components). Negotiation order in the proxy: URL
 * segment → `NEXT_LOCALE` cookie → `Accept-Language` → `pt-BR`. `/v1` never enters it.
 */
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: SOURCE_LOCALE,
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE_NAME },
  // Pages are private app screens, not public content: no `Link: alternate` header per locale.
  alternateLinks: false,
});
