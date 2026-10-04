import { isSupportedLocale, SUPPORTED_LOCALES } from "@core/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { WebClientApp } from "@/client/web-client-app";
import "./globals.css";

// Private app: nothing is indexed unless a page opts in (sign-in).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Every locale is prerendered (decision 0013 §3: static per locale under Cache Components). */
export function generateStaticParams(): { locale: string }[] {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

// All shipped locales are LTR; `dir` still follows the locale so an RTL one needs no refactor.
/**
 * Runs before any app code (`beforeInteractive`): Zod builds its schemas jitless, so it never
 * probes `new Function`. The page CSP has no 'unsafe-eval' (decision 0016) and browsers report the
 * blocked probe as a CSP violation even though Zod catches it.
 */
const ZOD_JITLESS_SCRIPT =
  "globalThis.__zod_globalConfig=Object.assign(globalThis.__zod_globalConfig||{},{jitless:true});";

const directionOf = (locale: string): "ltr" | "rtl" => {
  const info = (
    new Intl.Locale(locale) as Intl.Locale & { getTextInfo?: () => { direction?: string } }
  ).getTextInfo?.();
  return info?.direction === "rtl" ? "rtl" : "ltr";
};

/**
 * Static first paint while the client tree waits for the request (it reads the URL's search
 * params): translated on the server, so it needs no client provider.
 */
function BootFallback({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="grid min-h-svh place-items-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

/**
 * Renders the client tree at request time only (`connection()`, Next's advice for a client tree
 * that reads search params): it reads the URL node, `?unit=` included, to pick the display time
 * zone, and a per-request CSP nonce needs dynamic rendering anyway (decision 0016).
 */
async function AtRequestTime({ children }: { children: ReactNode }) {
  await connection();
  return children;
}

/**
 * Root layout per locale (SP2 spec §10): `<html lang dir>`, the Tailwind/tokens stylesheet and the
 * shared client providers. `suppressHydrationWarning`: next-themes sets `data-theme` on `<html>`
 * before React hydrates. Keyed by locale so a language switch builds a fresh client. The static
 * shell per locale is the document and a translated loading status; the client tree streams in.
 */
// Next.js requires the layout as a default export.
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = await getTranslations("common.states");
  return (
    <html lang={locale} dir={directionOf(locale)} suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <Script id="zod-jitless" strategy="beforeInteractive">
          {ZOD_JITLESS_SCRIPT}
        </Script>
        <Suspense fallback={<BootFallback label={t("loading")} />}>
          <AtRequestTime>
            <WebClientApp key={locale} locale={locale}>
              {children}
            </WebClientApp>
          </AtRequestTime>
        </Suspense>
      </body>
    </html>
  );
}
