import { describe, expect, it } from "vitest";
import { isCitationHref, resolveSafeLink } from "./link-policy.ts";

describe("resolveSafeLink", () => {
  it.each([
    ["https://example.com/docs?a=1#top", "https://example.com/docs?a=1#top", "example.com"],
    ["http://intranet.example:8080/x", "http://intranet.example:8080/x", "intranet.example:8080"],
    ["  HTTPS://Example.COM/a  ", "https://example.com/a", "example.com"],
  ])("keeps the http(s) link %s and shows its host", (raw, href, host) => {
    expect(resolveSafeLink(raw)).toEqual({ href, host });
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/1",
    "mailto:ana@example.com",
    "//example.com/protocol-relative",
    "/relative/path",
    "#fragment",
    "",
    "https://",
  ])("drops %s", (raw) => {
    expect(resolveSafeLink(raw)).toBeNull();
  });

  it("drops links that carry credentials (a host the reader does not see)", () => {
    expect(resolveSafeLink("https://example.com@evil.test/login")).toBeNull();
  });

  it("shows the punycode host of an internationalized domain", () => {
    expect(resolveSafeLink("https://exаmple.com/")?.host).toMatch(/^xn--/);
  });

  it("drops a missing href", () => {
    expect(resolveSafeLink(undefined)).toBeNull();
    expect(resolveSafeLink(null)).toBeNull();
  });
});

describe("isCitationHref", () => {
  it("recognizes only the internal citation fragment", () => {
    expect(isCitationHref("#cite-2")).toBe(2);
    expect(isCitationHref("#cite-x")).toBeNull();
    expect(isCitationHref("https://example.com/#cite-2")).toBeNull();
  });
});
