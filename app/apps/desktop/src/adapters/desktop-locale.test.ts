import { describe, expect, it, vi } from "vitest";
import { createLocaleStore, resolveDesktopLocale } from "./desktop-locale.ts";

describe("resolveDesktopLocale", () => {
  it("prefers the profile locale", () => {
    expect(resolveDesktopLocale({ profileLocale: "es-419", languages: ["en-US"] })).toBe("es-419");
  });

  it("falls back to the OS languages, matched best fit", () => {
    expect(resolveDesktopLocale({ profileLocale: undefined, languages: ["es-MX", "en"] })).toBe("es-419");
    expect(resolveDesktopLocale({ profileLocale: "fr-FR", languages: ["en-GB"] })).toBe("en-US");
  });

  it("falls back to pt-BR when nothing matches", () => {
    expect(resolveDesktopLocale({ profileLocale: undefined, languages: ["ja-JP"] })).toBe("pt-BR");
    expect(resolveDesktopLocale({ profileLocale: undefined, languages: [] })).toBe("pt-BR");
  });
});

describe("createLocaleStore", () => {
  it("notifies subscribers when the locale changes, and only then", () => {
    const store = createLocaleStore("pt-BR");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set("pt-BR");
    store.set("en-US");
    unsubscribe();
    store.set("es-419");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe("es-419");
  });
});
