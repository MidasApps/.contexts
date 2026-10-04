import { describe, expect, it } from "vitest";
import { assertPublicUrl, guardedFetch, isNonPublicAddress, type ResolveHost, UrlGuardError } from "./url-guard.ts";

const publicDns: ResolveHost = () => Promise.resolve(["93.184.216.34"]);
const dnsOf =
  (addresses: Record<string, string[]>): ResolveHost =>
  (host) =>
    Promise.resolve(addresses[host] ?? ["93.184.216.34"]);

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  return error instanceof UrlGuardError ? error.reason : String(error);
};

describe("url guard", () => {
  it("accepts a public https host", async () => {
    expect((await assertPublicUrl("https://docs.example.com/guide", { resolve: publicDns })).hostname).toBe(
      "docs.example.com",
    );
  });

  it.each([
    ["http://docs.example.com", "HTTPS_REQUIRED"],
    ["https://docs.example.com:8443/", "DEFAULT_PORT_REQUIRED"],
    ["https://user:pass@docs.example.com/", "CREDENTIALS_IN_URL"],
    ["https://127.0.0.1/", "IP_LITERAL"],
    ["https://169.254.169.254/latest/meta-data", "IP_LITERAL"],
    ["https://[::1]/", "IP_LITERAL"],
    ["https://localhost/", "SINGLE_LABEL_HOST"],
    ["https://metadata.google.internal/", "SINGLE_LABEL_HOST"],
    ["not a url", "INVALID_URL"],
  ])("rejects %s (%s)", async (url, reason) => {
    expect(await reasonOf(assertPublicUrl(url, { resolve: publicDns }))).toBe(reason);
  });

  it("rejects names that resolve to private, loopback, link-local or IPv6 loopback addresses", async () => {
    const resolve = dnsOf({
      "a.example.com": ["10.0.0.5"],
      "b.example.com": ["127.0.0.1"],
      "c.example.com": ["169.254.169.254"],
      "d.example.com": ["::1"],
      "e.example.com": ["93.184.216.34", "192.168.1.1"],
      "f.example.com": ["::ffff:10.0.0.1"],
    });
    for (const host of ["a", "b", "c", "d", "e", "f"])
      expect(await reasonOf(assertPublicUrl(`https://${host}.example.com/`, { resolve }))).toBe("PRIVATE_ADDRESS");
  });

  it("enforces the connector allowlist and fails closed on DNS errors", async () => {
    expect(
      await reasonOf(
        assertPublicUrl("https://other.example.com/", { allowedHosts: ["api.example.com"], resolve: publicDns }),
      ),
    ).toBe("HOST_NOT_ALLOWED");
    expect(
      await reasonOf(
        assertPublicUrl("https://api.example.com/", { resolve: () => Promise.reject(new Error("ENOTFOUND")) }),
      ),
    ).toBe("DNS_FAILED");
  });

  it("classifies addresses", () => {
    expect(isNonPublicAddress("100.64.0.1")).toBe(true);
    expect(isNonPublicAddress("fd00::1")).toBe(true);
    expect(isNonPublicAddress("8.8.8.8")).toBe(false);
    expect(isNonPublicAddress("2606:4700::1111")).toBe(false);
  });

  it("checks every redirect hop and refuses a redirect to a private address", async () => {
    const resolve = dnsOf({ "internal.example.com": ["10.1.2.3"] });
    const hops: string[] = [];
    const fakeFetch = (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      hops.push(url);
      return Promise.resolve(
        new Response(null, { status: 302, headers: { location: "https://internal.example.com/secret" } }),
      );
    };
    expect(await reasonOf(guardedFetch("https://docs.example.com/", { resolve, fetch: fakeFetch }))).toBe(
      "PRIVATE_ADDRESS",
    );
    expect(hops).toEqual(["https://docs.example.com/"]);
  });

  it("stops after too many redirects", async () => {
    const loop = () =>
      Promise.resolve(new Response(null, { status: 301, headers: { location: "https://docs.example.com/again" } }));
    expect(await reasonOf(guardedFetch("https://docs.example.com/", { resolve: publicDns, fetch: loop }))).toBe(
      "TOO_MANY_REDIRECTS",
    );
  });
});
