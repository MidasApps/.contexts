import { notFound } from "next/navigation";

/** Unknown paths under a locale render the locale's not-found page (next-intl routing guide). */
// Next.js requires pages as a default export.
export default function UnknownPage() {
  notFound();
}
