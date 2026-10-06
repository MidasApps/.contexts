"use client";

import { usePathname } from "next/navigation";
import { GlobalErrorContent, localeOfPath } from "@/client/global-error-content";
import "./[locale]/globals.css";

/**
 * The root (`[locale]`) layout failed to render (UX review U-07). Next replaces the whole document
 * with this file, so it renders `<html>` and `<body>` and imports the stylesheet itself; the
 * language comes from the path, the copy from the core catalogs.
 */
// Next.js requires the global error boundary as a default export.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = localeOfPath(usePathname());
  return (
    <html lang={locale}>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <GlobalErrorContent locale={locale} reference={error.digest} onRetry={retry} />
      </body>
    </html>
  );
}
