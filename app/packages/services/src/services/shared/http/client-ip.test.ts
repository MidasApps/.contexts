import { describe, expect, it } from "vitest";
import { clientIpOf } from "./client-ip.ts";

const request = (headers: Record<string, string>) => new Request("http://localhost/v1/x", { headers });

describe("clientIpOf", () => {
  it("takes the entry the last trusted proxy appended (one hop: the rightmost)", () => {
    expect(clientIpOf(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), { trustedProxyHops: 1 })).toBe("203.0.113.7");
  });

  it("skips the entries of further trusted proxies (two hops: load balancer in front)", () => {
    expect(clientIpOf(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 130.211.0.1" }), { trustedProxyHops: 2 })).toBe("203.0.113.7");
  });

  it("answers unknown when the header is shorter than the trusted chain or no proxy is trusted", () => {
    expect(clientIpOf(request({ "x-forwarded-for": "203.0.113.7" }), { trustedProxyHops: 2 })).toBe("unknown");
    expect(clientIpOf(request({ "x-forwarded-for": "203.0.113.7" }), { trustedProxyHops: 0 })).toBe("unknown");
    expect(clientIpOf(request({}), { trustedProxyHops: 1 })).toBe("unknown");
  });

  it("never trusts X-Real-IP, which a client can set", () => {
    expect(clientIpOf(request({ "x-real-ip": "6.6.6.6" }), { trustedProxyHops: 1 })).toBe("unknown");
  });
});
