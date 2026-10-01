import { describe, expect, it } from "vitest";
import { API_CONTENT_SECURITY_POLICY, buildPageContentSecurityPolicy, buildSecurityHeaders } from "./security-headers";

const toRecord = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map(({ key, value }) => [key, value]));

const directive = (policy: string, name: string) => policy.split("; ").find((entry) => entry.startsWith(`${name} `));

describe("buildSecurityHeaders", () => {
  it("sets the transport, sniffing, referrer and framing headers and leaves the CSP to the proxy", () => {
    const headers = toRecord(buildSecurityHeaders());

    expect(headers).toEqual({
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
  });
});

describe("buildPageContentSecurityPolicy", () => {
  it("locks down framing, plugins, base URI and form targets", () => {
    const policy = buildPageContentSecurityPolicy({ isDevelopment: false });

    for (const expected of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(policy).toContain(expected);
    }
  });

  it("allows the Firebase Auth endpoints and, only when given, the Auth Emulator origin", () => {
    expect(directive(buildPageContentSecurityPolicy({ isDevelopment: false }), "connect-src")).toBe(
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://storage.googleapis.com",
    );
    expect(directive(buildPageContentSecurityPolicy({ isDevelopment: false, authEmulatorOrigin: "http://127.0.0.1:9099" }), "connect-src")).toContain("http://127.0.0.1:9099");
  });

  it("lets uploads reach the signed URL origin (and the Storage Emulator in local) and plays only own or blob audio", () => {
    const policy = buildPageContentSecurityPolicy({ isDevelopment: false, storageEmulatorOrigin: "http://127.0.0.1:9199" });
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://storage.googleapis.com http://127.0.0.1:9199");
    expect(directive(policy, "media-src")).toBe("media-src 'self' blob:");
    expect(directive(policy, "img-src")).toBe("img-src 'self' blob: data:");
  });

  it("uses the nonce with strict-dynamic instead of unsafe-inline scripts when one is given", () => {
    const policy = buildPageContentSecurityPolicy({ isDevelopment: false, nonce: "abc123" });

    expect(directive(policy, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it("falls back to inline scripts without a nonce (decision 0016 §2)", () => {
    expect(directive(buildPageContentSecurityPolicy({ isDevelopment: false }), "script-src")).toBe("script-src 'self' 'unsafe-inline'");
  });

  it("never allows eval or websocket origins outside development", () => {
    const policy = buildPageContentSecurityPolicy({ isDevelopment: false });

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("ws:");
  });

  it("allows eval and the HMR websocket only in development", () => {
    const policy = buildPageContentSecurityPolicy({ isDevelopment: true });

    expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
    expect(directive(policy, "connect-src")).toContain("ws:");
  });
});

describe("API_CONTENT_SECURITY_POLICY", () => {
  it("lets nothing load from or frame a JSON response", () => {
    expect(API_CONTENT_SECURITY_POLICY).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});
