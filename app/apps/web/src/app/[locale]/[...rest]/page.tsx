import { notFound } from "next/navigation";
import { pageMetadata } from "@/server/page-metadata";

/**
 * The page title of an unknown path. The client tree streams in after the static shell, so the
 * 404 is drawn by the not-found boundary on the client: the document keeps this page's metadata,
 * and `not-found.tsx`'s own title never reaches it (WCAG 2.4.2: every page has a title).
 */
export const generateMetadata = pageMetadata("notFound");

/** Unknown paths under a locale render the locale's not-found page (next-intl routing guide). */
// Next.js requires pages as a default export.
export default function UnknownPage() {
  notFound();
}
