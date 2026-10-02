"use client";

import { Button } from "@core/client/shared/ui/atoms/Button/Button";
import { isSupportedLocale, loadMessages, SOURCE_LOCALE, type SupportedLocale } from "@core/i18n";
import { useMemo } from "react";
import { IntlProvider, useTranslations } from "use-intl";

/** The locale of a pathname (`/en-US/o/…` → `en-US`), else the source locale. */
export const localeOfPath = (pathname: string | null): SupportedLocale => {
  const segment = pathname?.split("/")[1];
  return segment !== undefined && isSupportedLocale(segment) ? segment : SOURCE_LOCALE;
};

export type GlobalErrorContentProps = {
  locale: SupportedLocale;
  /** The server's error identifier (Next `digest`). */
  reference: string | undefined;
  onRetry: () => void;
};

function GlobalErrorPage({ locale, reference, onRetry }: GlobalErrorContentProps) {
  const t = useTranslations();
  return (
    <main id="main" className="px-6">
      <title>{t("shell.serverError.title")}</title>
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{t("shell.serverError.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("shell.serverError.description")}</p>
        {reference === undefined ? null : <p className="mt-2 font-mono text-xs text-muted-foreground">{t("common.errorState.reference", { requestId: reference })}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onRetry}>
            {t("common.actions.retry")}
          </Button>
          {/* The router is gone with the root layout: a plain link reloads the app at home. */}
          <Button variant="secondary" asChild>
            <a href={`/${locale}`}>{t("shell.pageState.goHome")}</a>
          </Button>
        </div>
      </div>
    </main>
  );
}

/**
 * Body of `app/global-error.tsx` (UX review U-07): the root layout failed, so no app provider
 * exists. It loads the core catalogs itself, so the copy is the same translated text as the
 * `[locale]/error.tsx` page, with the server's reference, a retry and a way home.
 */
export function GlobalErrorContent(props: GlobalErrorContentProps) {
  const messages = useMemo(() => loadMessages(props.locale), [props.locale]);
  return (
    <IntlProvider locale={props.locale} messages={messages} timeZone="UTC">
      <GlobalErrorPage {...props} />
    </IntlProvider>
  );
}
