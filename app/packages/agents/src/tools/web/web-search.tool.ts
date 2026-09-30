import { z } from "zod";
import { defineCoreTool } from "../define-core-tool.ts";
import { clientFor, WEB_TOOLS_PERMISSION, type WebToolDeps } from "./web-scrape.tool.ts";
import { capText, WEB_CONTENT_MAX_CHARS, wrapUntrustedWebContent } from "./web-content.ts";

export const WEB_SEARCH_TOOL_ID = "web.search";
const SNIPPET_MAX_CHARS = 500;

const isHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * `web.search` (SP3 spec §8.5, decision 0027): up to 5 public web results through Firecrawl.
 * Titles and snippets are untrusted, so they come back as one wrapped Markdown list; only
 * https result addresses are kept (they are read later through `web.scrape` and its guard).
 */
export const createWebSearchTool = (deps: WebToolDeps) =>
  defineCoreTool({
    id: WEB_SEARCH_TOOL_ID,
    description: "Searches the public web and returns up to 5 results with their addresses. Use it when the answer needs current public information.",
    kind: "read",
    permission: WEB_TOOLS_PERMISSION,
    inputSchema: z.strictObject({
      query: z.string().trim().min(1).max(400).describe("What to search for."),
      limit: z.int().min(1).max(5).describe("How many results, 1 to 5."),
    }),
    outputSchema: z.strictObject({ urls: z.array(z.string()), content: z.string() }),
    execute: async (input, ctx) => {
      const client = await clientFor(deps, WEB_SEARCH_TOOL_ID, ctx.agent.tenantId);
      const results = (await client.search({ query: input.query, limit: input.limit, abortSignal: ctx.abortSignal })).filter((result) => isHttps(result.url)).slice(0, input.limit);
      const list = results.map((result) => `- [${result.title ?? result.url}](${result.url})${result.snippet === null ? "" : `: ${result.snippet.slice(0, SNIPPET_MAX_CHARS)}`}`).join("\n");
      return { urls: results.map((result) => result.url), content: wrapUntrustedWebContent("web-search", capText(list, WEB_CONTENT_MAX_CHARS).text) };
    },
  });
