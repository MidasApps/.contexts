import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./negotiate-locale.ts";

describe("negotiateLocale", () => {
  it("prefers a supported saved locale over the requested list", () => {
    expect(negotiateLocale({ requested: ["en-US"], saved: "es-419", fallback: "pt-BR" })).toBe("es-419");
  });

  it("canonicalizes the case of a saved locale", () => {
    expect(negotiateLocale({ requested: ["en-US"], saved: "pt-br", fallback: "en-US" })).toBe("pt-BR");
    expect(negotiateLocale({ requested: ["en-US"], saved: "ES-419", fallback: "pt-BR" })).toBe("es-419");
    expect(negotiateLocale({ requested: ["en-US"], saved: "not a tag!!", fallback: "pt-BR" })).toBe("en-US");
  });

  it("ignores an unsupported saved locale", () => {
    expect(negotiateLocale({ requested: ["en-US"], saved: "fr-FR", fallback: "pt-BR" })).toBe("en-US");
  });

  it("matches regional variants to the closest supported locale", () => {
    expect(negotiateLocale({ requested: ["es-MX"], fallback: "pt-BR" })).toBe("es-419");
    expect(negotiateLocale({ requested: ["pt"], fallback: "en-US" })).toBe("pt-BR");
    expect(negotiateLocale({ requested: ["en-GB"], fallback: "pt-BR" })).toBe("en-US");
  });

  it("walks the requested list in order", () => {
    expect(negotiateLocale({ requested: ["de-DE", "es-AR", "en-US"], fallback: "pt-BR" })).toBe("es-419");
  });

  it("returns the fallback when nothing matches or input is malformed", () => {
    expect(negotiateLocale({ requested: ["ja-JP"], fallback: "pt-BR" })).toBe("pt-BR");
    expect(negotiateLocale({ requested: [], fallback: "en-US" })).toBe("en-US");
    expect(negotiateLocale({ requested: ["not a tag!!"], fallback: "pt-BR" })).toBe("pt-BR");
  });
});
