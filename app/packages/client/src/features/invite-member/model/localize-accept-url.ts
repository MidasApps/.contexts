import { isSupportedLocale, type SupportedLocale } from "@core/i18n";

const INVITE_SEGMENT = "invite";

/**
 * The accept link in a UI locale: `<app>/invite#token=…` → `<app>/{locale}/invite#token=…`, so the
 * invitee opens the page in the inviter's language instead of a locale redirect (the web renders
 * every page under `/{locale}`, decision 0012). The API builds the link without a locale; a link
 * that already carries a supported locale, or is not an accept link, is returned unchanged.
 */
export const localizeAcceptUrl = (acceptUrl: string, locale: SupportedLocale): string => {
  if (!URL.canParse(acceptUrl)) return acceptUrl;
  const url = new URL(acceptUrl);
  const segments = url.pathname.split("/");
  if (segments.at(-1) !== INVITE_SEGMENT) return acceptUrl;
  if (isSupportedLocale(segments.at(-2) ?? "")) return acceptUrl;
  url.pathname = [...segments.slice(0, -1), locale, INVITE_SEGMENT].join("/");
  return url.toString();
};
