import { describe, expect, it } from "vitest";
import { createFirecrawlWebClient } from "./firecrawl-client.ts";
import { scrapeThroughGuard } from "./web-content.ts";

// Real-mode smoke (opt-in): runs only with FIRECRAWL_API_KEY in the environment; it calls the
// Firecrawl API and reads one public page. Every other run skips it (no key, no network).
const apiKey = process.env.FIRECRAWL_API_KEY;

describe.skipIf(apiKey === undefined || apiKey === "")("Firecrawl scrape (real)", () => {
  it("reads a public page as Markdown through the guard", { timeout: 60_000 }, async () => {
    const client = createFirecrawlWebClient({ apiKey: apiKey ?? null, apiUrl: process.env.FIRECRAWL_API_URL });
    const page = await scrapeThroughGuard({ client, url: "https://example.com/" });
    expect(page.url.startsWith("https://")).toBe(true);
    expect(page.markdown.length).toBeGreaterThan(0);
  });
});
