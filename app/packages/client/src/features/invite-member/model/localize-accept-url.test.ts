import { describe, expect, it } from "vitest";
import { localizeAcceptUrl } from "./localize-accept-url.ts";

const TOKEN = "Zx9Cv8Bn7Mm6Aa5Ss4Dd3Ff2Gg1Hh0Jj9Kk8Ll7Qq6W";

describe("localizeAcceptUrl", () => {
  it("puts the locale segment before /invite and keeps the #token= fragment", () => {
    expect(localizeAcceptUrl(`https://app.example.com/invite#token=${TOKEN}`, "pt-BR")).toBe(`https://app.example.com/pt-BR/invite#token=${TOKEN}`);
    expect(localizeAcceptUrl(`http://localhost:3100/invite#token=${TOKEN}`, "en-US")).toBe(`http://localhost:3100/en-US/invite#token=${TOKEN}`);
    expect(localizeAcceptUrl(`https://app.example.com/invite#token=${TOKEN}`, "es-419")).toBe(`https://app.example.com/es-419/invite#token=${TOKEN}`);
  });

  it("keeps a base path of the app URL", () => {
    expect(localizeAcceptUrl(`https://example.com/app/invite#token=${TOKEN}`, "en-US")).toBe(`https://example.com/app/en-US/invite#token=${TOKEN}`);
  });

  it("leaves a link that already carries a supported locale alone (idempotent)", () => {
    const localized = `https://app.example.com/es-419/invite#token=${TOKEN}`;
    expect(localizeAcceptUrl(localized, "pt-BR")).toBe(localized);
    expect(localizeAcceptUrl(localizeAcceptUrl(`https://app.example.com/invite#token=${TOKEN}`, "pt-BR"), "pt-BR")).toBe(`https://app.example.com/pt-BR/invite#token=${TOKEN}`);
  });

  it("returns anything that is not an accept link unchanged", () => {
    expect(localizeAcceptUrl("not a url", "pt-BR")).toBe("not a url");
    expect(localizeAcceptUrl(`https://app.example.com/other#token=${TOKEN}`, "pt-BR")).toBe(`https://app.example.com/other#token=${TOKEN}`);
  });
});
