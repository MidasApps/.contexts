import type { SecretStore, WebContentPort } from "../../runtime/runtime-ports.ts";
import { createFakeModeResolver } from "./fake-firecrawl.ts";
import { createWebClientResolver, type WebClientEnv, type WebClientResolver } from "./firecrawl-client.ts";
import { type ResolveHost, resolveWithDns } from "./url-guard.ts";
import { createFirecrawlWebContent } from "./web-content.ts";
import { createWebScrapeTool } from "./web-scrape.tool.ts";
import { createWebSearchTool } from "./web-search.tool.ts";

/** Tool ids the web agent adds when the tenant opted in to Firecrawl and a key exists. */
export const FIRECRAWL_TOOL_IDS = ["web.search", "web.scrape"] as const;

/** DNS of the SSRF guard: real DNS, plus the fixture hosts in `AI_MODE=fake`. */
export const guardResolverFor = (aiMode: WebClientEnv["AI_MODE"]): ResolveHost => (aiMode === "fake" ? createFakeModeResolver(resolveWithDns) : resolveWithDns);

/** What the composition wires once: the tenant client resolver and the guard's DNS. */
export type WebToolsRuntime = { readonly clients: WebClientResolver; readonly resolve: ResolveHost };

export const createWebToolsRuntime = (deps: { readonly env: WebClientEnv; readonly secrets: SecretStore }): WebToolsRuntime => ({
  clients: createWebClientResolver(deps),
  resolve: guardResolverFor(deps.env.AI_MODE),
});

/** `web.search` and `web.scrape` definitions bound to one runtime (registered once in the tool registry). */
export const createFirecrawlTools = (runtime: WebToolsRuntime) => [createWebSearchTool(runtime), createWebScrapeTool(runtime)];

/** The knowledge ingestion's `WebContentPort` over the same Firecrawl clients and guard (bound in `apps/mastra`). */
export const createWebContentPort = (deps: { readonly env: WebClientEnv; readonly secrets: SecretStore }): WebContentPort =>
  createFirecrawlWebContent(createWebToolsRuntime(deps));
