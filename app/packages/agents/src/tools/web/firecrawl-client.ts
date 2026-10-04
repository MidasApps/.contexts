import Firecrawl from "firecrawl";
import type { SecretStore, WebPage } from "../../runtime/runtime-ports.ts";
import { createFakeWebClient } from "./fake-firecrawl.ts";

/** One web search hit; title and snippet are untrusted text written by strangers. */
export type WebSearchResult = { readonly url: string; readonly title: string | null; readonly snippet: string | null };

/**
 * What the web tools and the URL ingestion need from Firecrawl (SP3 spec §8.5, decision 0027).
 * The SSRF guard is the caller's job: this client only talks to the configured Firecrawl API.
 */
export type WebClient = {
  readonly search: (input: {
    readonly query: string;
    readonly limit: number;
    readonly abortSignal?: AbortSignal;
  }) => Promise<readonly WebSearchResult[]>;
  /** Markdown of the main content; `url` is the final address Firecrawl read (after redirects). */
  readonly scrape: (input: { readonly url: string; readonly abortSignal?: AbortSignal }) => Promise<WebPage>;
};

/** The Firecrawl client of a tenant, or `null` when neither a tenant nor a platform key exists. */
export type WebClientResolver = { readonly forTenant: (tenantId: string) => Promise<WebClient | null> };

export type WebClientEnv = {
  readonly AI_MODE: "real" | "fake";
  readonly FIRECRAWL_API_KEY?: string | undefined;
  readonly FIRECRAWL_API_URL?: string | undefined;
};

/** Secret Manager id of a tenant's own Firecrawl key (bring your own key; written by SP5 settings). */
export const firecrawlSecretRefOf = (tenantId: string): string => `firecrawl-${tenantId}`;

/** Firecrawl answers slower than a plain fetch (it renders pages); the tool timeout still caps it. */
const FIRECRAWL_TIMEOUT_MS = 12_000;

// The SDK takes no AbortSignal: the call is abandoned (not cancelled upstream) when the run stops.
const reasonOf = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new Error("aborted");

const abortable = <T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (signal === undefined) return work;
  if (signal.aborted) return Promise.reject(reasonOf(signal));
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(reasonOf(signal)), { once: true });
    }),
  ]);
};

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/**
 * Real client over the `firecrawl` SDK (v2 API). Key and URL are always passed explicitly,
 * so the SDK never falls back to `process.env`. Scrape asks for Markdown of the main content
 * only; search asks for web results only.
 */
export const createFirecrawlWebClient = (options: {
  readonly apiKey: string | null;
  readonly apiUrl?: string | undefined;
}): WebClient => {
  const client = new Firecrawl({
    apiKey: options.apiKey,
    apiUrl: options.apiUrl ?? null,
    timeoutMs: FIRECRAWL_TIMEOUT_MS,
    maxRetries: 1,
  });
  return {
    search: async ({ query, limit, abortSignal }) => {
      const data = await abortable(client.search(query, { limit, sources: ["web"] }), abortSignal);
      return (data.web ?? []).flatMap((hit) => {
        // A hit is a plain result, or a scraped Document when scrapeOptions are set (never here).
        const metadata = "metadata" in hit ? hit.metadata : undefined;
        const url = "url" in hit ? textOrNull(hit.url) : textOrNull(metadata?.sourceURL);
        if (url === null) return [];
        const title = "title" in hit ? textOrNull(hit.title) : textOrNull(metadata?.title);
        const snippet = "description" in hit ? textOrNull(hit.description) : null;
        return [{ url, title, snippet }];
      });
    },
    scrape: async ({ url, abortSignal }) => {
      const document = await abortable(
        client.scrape(url, { formats: ["markdown"], onlyMainContent: true, blockAds: true }),
        abortSignal,
      );
      const finalUrl = textOrNull(document.metadata?.url) ?? textOrNull(document.metadata?.sourceURL) ?? url;
      return { url: finalUrl, title: textOrNull(document.metadata?.title), markdown: document.markdown ?? "" };
    },
  };
};

/**
 * Picks the client of a tenant: fake fixtures in `AI_MODE=fake`; otherwise the tenant's own
 * key (`firecrawl-<tenantId>` in the secret store), else the platform `FIRECRAWL_API_KEY`.
 * A self-hosted Firecrawl (`FIRECRAWL_API_URL`) may run without a key.
 */
export const createWebClientResolver = (deps: {
  readonly env: WebClientEnv;
  readonly secrets: SecretStore;
  /** Test seam; defaults to the SDK client. */
  readonly create?: (options: { readonly apiKey: string | null; readonly apiUrl?: string | undefined }) => WebClient;
}): WebClientResolver => {
  const create = deps.create ?? createFirecrawlWebClient;
  const fake = createFakeWebClient();
  return {
    forTenant: async (tenantId) => {
      if (deps.env.AI_MODE === "fake") return fake;
      const tenantKey = await deps.secrets.get(firecrawlSecretRefOf(tenantId));
      const apiKey = tenantKey ?? deps.env.FIRECRAWL_API_KEY ?? null;
      if (apiKey === null && deps.env.FIRECRAWL_API_URL === undefined) return null;
      return create({ apiKey, apiUrl: deps.env.FIRECRAWL_API_URL });
    },
  };
};
