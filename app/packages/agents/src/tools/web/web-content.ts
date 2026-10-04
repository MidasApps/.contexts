import type { WebContentPort, WebPage } from "../../runtime/runtime-ports.ts";
import type { WebClient, WebClientResolver } from "./firecrawl-client.ts";
import { assertPublicUrl, type ResolveHost } from "./url-guard.ts";

/** Web page text a tool hands the model (SP3 spec §8.5). */
export const WEB_CONTENT_MAX_CHARS = 20_000;
/** A page indexed into the knowledge base; chunking handles the length, this only bounds memory. */
export const WEB_INGEST_MAX_CHARS = 500_000;

const TAG = "untrusted_web_content";

/** Neither a quote in the source nor a closing tag in the text can break out of the wrapper. */
export const wrapUntrustedWebContent = (source: string, text: string): string => {
  const safeSource = source.replace(/["<>\n]/g, "");
  const safeText = text.replace(new RegExp(`</?${TAG}`, "gi"), (match) => match.replace("<", "&lt;"));
  return `<${TAG} source="${safeSource}">\n${safeText}\n</${TAG}>`;
};

export const capText = (text: string, max: number): { readonly text: string; readonly truncated: boolean } =>
  text.length <= max ? { text, truncated: false } : { text: text.slice(0, max), truncated: true };

/** Firecrawl is unavailable for the tenant: no tenant key, no platform key, no self-hosted URL. */
export class WebToolsUnavailableError extends Error {
  readonly code = "WEB_TOOLS_UNAVAILABLE";

  constructor() {
    super("WEB_TOOLS_UNAVAILABLE: no Firecrawl key for this tenant");
    this.name = "WebToolsUnavailableError";
  }
}

/**
 * Scrapes a URL through the SSRF guard (spec §8.5): the requested URL is checked before
 * Firecrawl is called, and the final address Firecrawl read is checked again, because a
 * self-hosted Firecrawl follows redirects inside our network.
 * @throws {UrlGuardError} for a URL or final address that is not public https.
 */
export const scrapeThroughGuard = async (args: {
  readonly client: WebClient;
  readonly url: string;
  readonly resolve?: ResolveHost | undefined;
  readonly abortSignal?: AbortSignal | undefined;
}): Promise<WebPage> => {
  const guard = args.resolve === undefined ? {} : { resolve: args.resolve };
  const url = await assertPublicUrl(args.url, guard);
  const page = await args.client.scrape({
    url: url.href,
    ...(args.abortSignal === undefined ? {} : { abortSignal: args.abortSignal }),
  });
  await assertPublicUrl(page.url, guard);
  return page;
};

/**
 * `WebContentPort` of the knowledge ingestion (URL sources, Task 14 hook): the same client
 * resolution and guard as the `web.scrape` tool, Markdown bounded to 500 000 characters.
 * URL ingestion is an explicit `core.knowledge.write` action, so it needs a key but not the
 * chat opt-in `webTools.firecrawl`.
 */
export const createFirecrawlWebContent = (deps: {
  readonly clients: WebClientResolver;
  readonly resolve?: ResolveHost;
}): WebContentPort => ({
  scrape: async ({ url, tenantId, abortSignal }) => {
    const client = await deps.clients.forTenant(tenantId);
    if (client === null) throw new WebToolsUnavailableError();
    const page = await scrapeThroughGuard({ client, url, resolve: deps.resolve, abortSignal });
    return { ...page, markdown: capText(page.markdown, WEB_INGEST_MAX_CHARS).text };
  },
});
