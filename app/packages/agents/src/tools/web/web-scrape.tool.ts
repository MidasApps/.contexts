import { z } from "zod";
import { defineCoreTool } from "../define-core-tool.ts";
import { toolFailure } from "../tool-errors.ts";
import type { WebClient, WebClientResolver } from "./firecrawl-client.ts";
import { type ResolveHost, UrlGuardError } from "./url-guard.ts";
import { capText, scrapeThroughGuard, WEB_CONTENT_MAX_CHARS, wrapUntrustedWebContent } from "./web-content.ts";

export const WEB_SCRAPE_TOOL_ID = "web.scrape";
export const WEB_TOOLS_PERMISSION = "core.web-tools.use";

export type WebToolDeps = { readonly clients: WebClientResolver; readonly resolve?: ResolveHost };

/** The tenant's Firecrawl client; a tenant without a key gets a typed failure, never a platform default. */
export const clientFor = async (deps: WebToolDeps, toolId: string, tenantId: string): Promise<WebClient> => {
  const client = await deps.clients.forTenant(tenantId);
  if (client === null)
    throw toolFailure(toolId, "WEB_TOOLS_UNAVAILABLE", "Web tools are not configured for this organization.");
  return client;
};

/**
 * `web.scrape` (SP3 spec §8.5, decision 0027): Markdown of one public page through Firecrawl,
 * behind the SSRF guard, capped at 20 000 characters and wrapped as untrusted data. The web
 * agent offers it only in tenants with the `webTools.firecrawl` opt-in.
 */
export const createWebScrapeTool = (deps: WebToolDeps) =>
  defineCoreTool({
    id: WEB_SCRAPE_TOOL_ID,
    description:
      "Reads one public web page (https) and returns its main text as Markdown. Use it when the user gives an address or a search result must be read.",
    kind: "read",
    permission: WEB_TOOLS_PERMISSION,
    inputSchema: z.strictObject({ url: z.url().max(2048).describe("Public https address of the page.") }),
    outputSchema: z.strictObject({
      url: z.string(),
      title: z.string().nullable(),
      content: z.string(),
      truncated: z.boolean(),
    }),
    execute: async (input, ctx) => {
      const client = await clientFor(deps, WEB_SCRAPE_TOOL_ID, ctx.agent.tenantId);
      try {
        const page = await scrapeThroughGuard({
          client,
          url: input.url,
          resolve: deps.resolve,
          abortSignal: ctx.abortSignal,
        });
        const capped = capText(page.markdown, WEB_CONTENT_MAX_CHARS);
        return {
          url: page.url,
          title: page.title,
          content: wrapUntrustedWebContent(page.url, capped.text),
          truncated: capped.truncated,
        };
      } catch (error: unknown) {
        if (error instanceof UrlGuardError)
          throw toolFailure(WEB_SCRAPE_TOOL_ID, "URL_REJECTED", "Only public https pages can be read.", {
            reason: error.reason,
          });
        throw error;
      }
    },
  });
