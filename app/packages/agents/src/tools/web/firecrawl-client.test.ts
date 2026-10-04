import { describe, expect, it } from "vitest";
import type { SecretStore } from "../../runtime/runtime-ports.ts";
import { FAKE_WEB_PAGES } from "./fake-firecrawl.ts";
import { createWebClientResolver, firecrawlSecretRefOf, type WebClient } from "./firecrawl-client.ts";
import { createFirecrawlWebContent } from "./web-content.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const secretsWith = (values: Record<string, string>): SecretStore & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    get: (ref) => {
      asked.push(ref);
      return Promise.resolve(values[ref] ?? null);
    },
  };
};

const recordingFactory = () => {
  const created: { apiKey: string | null; apiUrl?: string | undefined }[] = [];
  const stub: WebClient = {
    search: () => Promise.resolve([]),
    scrape: ({ url }) => Promise.resolve({ url, title: null, markdown: "" }),
  };
  return {
    created,
    create: (options: { apiKey: string | null; apiUrl?: string | undefined }) => (created.push(options), stub),
  };
};

describe("createWebClientResolver", () => {
  it("serves fixture pages without any key in fake mode", async () => {
    const client = await createWebClientResolver({ env: { AI_MODE: "fake" }, secrets: secretsWith({}) }).forTenant(
      TENANT,
    );
    expect(await client?.scrape({ url: FAKE_WEB_PAGES[0]?.url ?? "" })).toEqual(FAKE_WEB_PAGES[0]);
  });

  it("prefers the tenant's own key, then the platform key", async () => {
    const factory = recordingFactory();
    const secrets = secretsWith({ [firecrawlSecretRefOf(TENANT)]: "tenant-key" });
    const resolver = createWebClientResolver({
      env: { AI_MODE: "real", FIRECRAWL_API_KEY: "platform-key" },
      secrets,
      create: factory.create,
    });
    await resolver.forTenant(TENANT);
    await resolver.forTenant("OtherTenant000000000");
    expect(factory.created).toEqual([
      { apiKey: "tenant-key", apiUrl: undefined },
      { apiKey: "platform-key", apiUrl: undefined },
    ]);
    expect(secrets.asked).toEqual([`firecrawl-${TENANT}`, "firecrawl-OtherTenant000000000"]);
  });

  it("has no client without any key, unless a self-hosted Firecrawl is configured", async () => {
    const factory = recordingFactory();
    expect(
      await createWebClientResolver({
        env: { AI_MODE: "real" },
        secrets: secretsWith({}),
        create: factory.create,
      }).forTenant(TENANT),
    ).toBeNull();
    const selfHosted = createWebClientResolver({
      env: { AI_MODE: "real", FIRECRAWL_API_URL: "https://firecrawl.internal.example.com" },
      secrets: secretsWith({}),
      create: factory.create,
    });
    expect(await selfHosted.forTenant(TENANT)).not.toBeNull();
    expect(factory.created).toEqual([{ apiKey: null, apiUrl: "https://firecrawl.internal.example.com" }]);
  });
});

describe("createFirecrawlWebContent (knowledge URL ingestion)", () => {
  const PUBLIC = () => Promise.resolve(["93.184.215.14"]);

  it("scrapes through the guard with the tenant's client", async () => {
    const port = createFirecrawlWebContent({
      clients: createWebClientResolver({ env: { AI_MODE: "fake" }, secrets: secretsWith({}) }),
      resolve: PUBLIC,
    });
    expect(await port.scrape({ url: "https://docs.example.com/getting-started", tenantId: TENANT })).toMatchObject({
      title: "Getting started",
    });
  });

  it("refuses private addresses and tenants without a key", async () => {
    const fake = createFirecrawlWebContent({
      clients: createWebClientResolver({ env: { AI_MODE: "fake" }, secrets: secretsWith({}) }),
      resolve: () => Promise.resolve(["169.254.169.254"]),
    });
    await expect(fake.scrape({ url: "https://docs.example.com/x", tenantId: TENANT })).rejects.toMatchObject({
      code: "URL_REJECTED",
    });
    const keyless = createFirecrawlWebContent({
      clients: createWebClientResolver({ env: { AI_MODE: "real" }, secrets: secretsWith({}) }),
      resolve: PUBLIC,
    });
    await expect(keyless.scrape({ url: "https://docs.example.com/x", tenantId: TENANT })).rejects.toMatchObject({
      code: "WEB_TOOLS_UNAVAILABLE",
    });
  });
});
