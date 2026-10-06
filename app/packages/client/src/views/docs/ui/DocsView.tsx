"use client";

import { useLocale, useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { DocsMarkdown } from "./DocsMarkdown.tsx";

/** One page of the guide in its sidebar; `slug` "" is the guide's index. */
export type DocsNavPage = { readonly slug: string; readonly title: string };
export type DocsNavGroup = { readonly title: string; readonly pages: readonly DocsNavPage[] };

export type DocsViewProps = {
  readonly groups: readonly DocsNavGroup[];
  /** Slug of the page shown. */
  readonly page: string;
  readonly markdown: string;
  /** Language the page is written in; a notice is shown when it is not the UI language. */
  readonly contentLocale: string;
};

function DocsNav({ groups, page }: { groups: readonly DocsNavGroup[]; page: string }) {
  return (
    <ul className="flex flex-col gap-6">
      {groups.map((group) => (
        <li key={group.title}>
          <p className="mb-2 text-caption font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.pages.map((entry) => (
              <li key={entry.slug}>
                <RouteLink
                  to={{ id: "docs", page: entry.slug }}
                  aria-current={entry.slug === page ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-body-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                    entry.slug === page && "bg-muted font-medium text-foreground",
                  )}
                >
                  {entry.title}
                </RouteLink>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function PageSteps({ previous, next }: { previous: DocsNavPage | undefined; next: DocsNavPage | undefined }) {
  const t = useTranslations("common.docs");
  if (previous === undefined && next === undefined) return null;
  const step = "flex flex-col gap-1 rounded-lg border border-border p-4 hover:bg-muted";
  return (
    <nav aria-label={t("steps")} className="mt-12 grid gap-4 sm:grid-cols-2">
      {previous === undefined ? (
        <span />
      ) : (
        <RouteLink to={{ id: "docs", page: previous.slug }} className={step}>
          <span className="flex items-center gap-1 text-caption text-muted-foreground">
            <Icon name="arrow-left" />
            {t("previous")}
          </span>
          <span className="font-medium">{previous.title}</span>
        </RouteLink>
      )}
      {next === undefined ? null : (
        <RouteLink to={{ id: "docs", page: next.slug }} className={cn(step, "sm:items-end sm:text-end")}>
          <span className="flex items-center gap-1 text-caption text-muted-foreground">
            {t("next")}
            <Icon name="arrow-right" />
          </span>
          <span className="font-medium">{next.title}</span>
        </RouteLink>
      )}
    </nav>
  );
}

/**
 * The user guide at `/docs` (decision 0073): every page in a sidebar by group, the page's
 * Markdown, and links to the previous and next pages. Readable signed out, outside the app shell.
 */
export function DocsView({ groups, page, markdown, contentLocale }: DocsViewProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pages = groups.flatMap((group) => group.pages);
  const index = pages.findIndex((entry) => entry.slug === page);
  const translated = contentLocale === locale;
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <RouteLink to={{ id: "docs", page: "" }} className="flex items-center gap-2 font-semibold">
            <Icon name="file-text" />
            {t("common.pageTitles.docs")}
          </RouteLink>
          <RouteLink
            to={{ id: "home" }}
            className="flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground"
          >
            {t("common.docs.backToApp")}
            <Icon name="arrow-right" />
          </RouteLink>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        {/* Folded on small screens, a sticky column from `lg` up. */}
        <nav aria-label={t("common.docs.nav")} className="lg:sticky lg:top-6 lg:self-start">
          <details className="mb-6 rounded-lg border border-border p-3 lg:hidden">
            <summary className="cursor-pointer font-medium">{t("common.docs.pages")}</summary>
            <div className="mt-4">
              <DocsNav groups={groups} page={page} />
            </div>
          </details>
          <div className="hidden lg:block">
            <DocsNav groups={groups} page={page} />
          </div>
        </nav>
        <main className="min-w-0">
          {translated ? null : (
            <Alert variant="info" className="mb-6">
              <AlertDescription className="text-inherit">{t("common.docs.fallback")}</AlertDescription>
            </Alert>
          )}
          <article lang={translated ? undefined : contentLocale}>
            <DocsMarkdown>{markdown}</DocsMarkdown>
          </article>
          <PageSteps previous={index > 0 ? pages[index - 1] : undefined} next={pages[index + 1]} />
        </main>
      </div>
    </div>
  );
}
