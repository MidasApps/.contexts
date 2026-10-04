import type { WebPage } from "../../runtime/runtime-ports.ts";
import type { WebClient, WebSearchResult } from "./firecrawl-client.ts";

/**
 * `AI_MODE=fake` Firecrawl (SP3 spec §5.3, §8.5): fixture pages on reserved example hosts,
 * no network. Search matches words of the query against the fixtures; scrape answers the
 * fixture page or a generic page for any other public URL, so offline flows (seed, e2e,
 * evals) can ingest and cite URLs.
 */
export const FAKE_WEB_PAGES: readonly WebPage[] = [
  {
    url: "https://docs.example.com/getting-started",
    title: "Getting started",
    markdown: "# Getting started\n\nCreate a project, invite members and connect your data sources.",
  },
  {
    url: "https://docs.example.com/security",
    title: "Security overview",
    markdown: "# Security overview\n\nEvery request is authenticated, authorized per tenant and audited.",
  },
];

/** Hosts of the fixtures; the composition resolves them to a public test address in fake mode. */
export const FAKE_WEB_HOSTS: ReadonlySet<string> = new Set(FAKE_WEB_PAGES.map((page) => new URL(page.url).hostname));

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

const matches = (page: WebPage, query: string): boolean => {
  const haystack = `${page.title ?? ""} ${page.markdown}`.toLowerCase();
  return words(query).some((word) => haystack.includes(word));
};

export const createFakeWebClient = (pages: readonly WebPage[] = FAKE_WEB_PAGES): WebClient => ({
  search: ({ query, limit }) =>
    Promise.resolve(
      pages
        .filter((page) => matches(page, query))
        .slice(0, limit)
        .map(
          (page): WebSearchResult => ({
            url: page.url,
            title: page.title,
            snippet: page.markdown.split("\n").at(-1) ?? null,
          }),
        ),
    ),
  scrape: ({ url }) =>
    Promise.resolve(
      pages.find((page) => page.url === url) ?? {
        url,
        title: "Example page",
        markdown: `# Example page\n\nFixture content of ${url}.`,
      },
    ),
});

/** Public test address the fixture hosts resolve to in fake mode (never a reserved range). */
const FAKE_PUBLIC_ADDRESS = "93.184.215.14";

/**
 * DNS for `AI_MODE=fake`: fixture hosts resolve to a public test address so offline runs pass
 * the SSRF guard; every other host still goes through `fallback` (real DNS), so the guard
 * keeps refusing private and loopback targets in fake mode too.
 */
export const createFakeModeResolver =
  (fallback: (host: string) => Promise<readonly string[]>) =>
  (host: string): Promise<readonly string[]> =>
    FAKE_WEB_HOSTS.has(host) ? Promise.resolve([FAKE_PUBLIC_ADDRESS]) : fallback(host);
