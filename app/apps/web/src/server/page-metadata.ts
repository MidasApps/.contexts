import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Keys of `common.pageTitles` (one per route id of SP2 spec §4). */
export type PageTitleKey = "signIn" | "invite" | "home" | "organizations" | "organization" | "project" | "module" | "settings" | "profile" | "admin" | "notFound";

/**
 * `generateMetadata` of a route file: the translated page title and `noindex` (the app is private;
 * only sign-in may be indexed).
 * @example export const generateMetadata = pageMetadata("organizations");
 */
export const pageMetadata =
  (key: PageTitleKey, options: { indexable?: boolean } = {}) =>
  async (): Promise<Metadata> => {
    const t = await getTranslations("common.pageTitles");
    return { title: t(key), robots: options.indexable === true ? { index: true, follow: true } : { index: false, follow: false } };
  };
