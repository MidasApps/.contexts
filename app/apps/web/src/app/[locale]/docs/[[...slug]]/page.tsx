import { DocsView } from "@core/client/views/docs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DOCS_CONTENT_LOCALE, DOCS_GROUPS, findDocsPage, readDocsPage } from "@/server/docs/docs-pages";

type DocsPageProps = PageProps<"/[locale]/docs/[[...slug]]">;

/** `/docs` is the index, `/docs/<slug>` one page; deeper paths are not pages. */
const pageOf = async (params: DocsPageProps["params"]) => {
  const { slug } = await params;
  if (slug === undefined) return findDocsPage("");
  return slug.length === 1 && slug[0] !== undefined ? findDocsPage(slug[0]) : undefined;
};

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const [page, t] = await Promise.all([pageOf(params), getTranslations("common.pageTitles")]);
  const title = page === undefined || page.slug === "" ? t("docs") : `${page.title} · ${t("docs")}`;
  return { title, robots: { index: false, follow: false } };
}

/** Reads the page at request time, so an edited file shows at once (decision 0073). */
async function DocsContent({ params }: { params: DocsPageProps["params"] }) {
  const page = await pageOf(params);
  if (page === undefined) notFound();
  const markdown = await readDocsPage(page);
  return <DocsView groups={DOCS_GROUPS} page={page.slug} markdown={markdown} contentLocale={DOCS_CONTENT_LOCALE} />;
}

/** The user guide (decision 0073): outside the signed-in shell, so it reads without a session. */
// Next.js requires pages as a default export.
export default function DocsPage({ params }: DocsPageProps) {
  return (
    <Suspense fallback={null}>
      <DocsContent params={params} />
    </Suspense>
  );
}
