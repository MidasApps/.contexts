import { isSupportedLocale, loadMessages, SOURCE_LOCALE } from "@core/i18n";
import { locale as rootLocale } from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import { serverModuleMessages } from "@/server/module-messages";

/**
 * next-intl request config (server side only: `getTranslations` in `generateMetadata`). The locale
 * is the `[locale]` root param (`next/root-params`, so pages stay static per locale); messages are
 * the core catalogs plus the installed modules' (decision 0013 §2). Client views get theirs from
 * the shared `ClientApp`.
 */
// next-intl's plugin loads this module by path and requires a default export.
export default getRequestConfig(async () => {
  const segment = await rootLocale();
  const locale = isSupportedLocale(segment) ? segment : SOURCE_LOCALE;
  return { locale, messages: loadMessages(locale, serverModuleMessages()) };
});
