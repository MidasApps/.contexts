import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./security-headers";

const toRecord = (headers: { key: string; value: string }[]) =>
  Object.fromEntries(headers.map(({ key, value }) => [key, value]));

describe("buildSecurityHeaders", () => {
  it("sets the transport, sniffing, referrer and framing headers", () => {
    const headers = toRecord(buildSecurityHeaders({ isDevelopment: false }));

    expect(headers).toMatchObject({
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    expect(headers["Content-Security-Policy"]).toBe(buildContentSecurityPolicy({ isDevelopment: false }));
  });
});

describe("buildContentSecurityPolicy", () => {
  it("locks down framing, plugins, base URI and form targets", () => {
    const policy = buildContentSecurityPolicy({ isDevelopment: false });

    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(policy).toContain(directive);
    }
  });

  it("never allows eval or websocket origins outside development", () => {
    const policy = buildContentSecurityPolicy({ isDevelopment: false });

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("ws:");
  });

  it("allows eval and the HMR websocket only in development", () => {
    const policy = buildContentSecurityPolicy({ isDevelopment: true });

    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws:");
  });
});
