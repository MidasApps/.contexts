import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS_CONTENT_DIR, DOCS_CONTENT_LOCALE, DOCS_GROUPS, docsFileOf, findDocsPage } from "./docs-pages";

const PAGES = DOCS_GROUPS.flatMap((group) => group.pages);
const CONTENT = path.join(DOCS_CONTENT_DIR, DOCS_CONTENT_LOCALE);
const SCREENSHOTS = path.join(import.meta.dirname, "../../../public/guide");

/** Every `](/guide/...)` screenshot name of a Markdown text. */
const screenshotsOf = (markdown: string): string[] =>
  [...markdown.matchAll(/\]\(\/guide\/([^)\s]+)\)/gu)].map((match) => match[1] ?? "");

/** Every `](/docs...)` link target of a Markdown text. */
const guideLinksOf = (markdown: string): string[] =>
  [...markdown.matchAll(/\]\((\/docs[^)\s]*)\)/gu)].map((match) => match[1] ?? "");

describe("the user guide", () => {
  it("has one Markdown file per page, starting with a title, and no file outside the sidebar", () => {
    const files = readdirSync(CONTENT).filter((file) => file.endsWith(".md"));
    const expected = PAGES.map((page) => path.basename(docsFileOf(page)));
    expect(files.sort()).toEqual([...expected].sort());
    for (const page of PAGES) expect(readFileSync(docsFileOf(page), "utf8")).toMatch(/^# \S/u);
  });

  it("lists every slug once", () => {
    const slugs = PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("links only to pages that exist", () => {
    const broken = PAGES.flatMap((page) =>
      guideLinksOf(readFileSync(docsFileOf(page), "utf8"))
        .filter((href) => {
          const slug = href === "/docs" ? "" : href.replace(/^\/docs\//u, "");
          return findDocsPage(slug) === undefined;
        })
        .map((href) => `${page.slug || "index"} → ${href}`),
    );
    expect(broken).toEqual([]);
  });

  it("shows screenshots that exist, and keeps none no page shows", () => {
    const shown = new Set(PAGES.flatMap((page) => screenshotsOf(readFileSync(docsFileOf(page), "utf8"))));
    expect([...shown].sort()).toEqual(readdirSync(SCREENSHOTS).sort());
  });

  it("finds no page for a slug outside the sidebar", () => {
    expect(findDocsPage("../../package.json")).toBeUndefined();
    expect(findDocsPage("nope")).toBeUndefined();
  });
});
