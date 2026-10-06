import path from "node:path";
import { describe, expect, it } from "vitest";
import { type CatalogEntry, checkCatalogs } from "./check-catalogs.ts";
import { readCoreCatalogs, readModuleCatalogs } from "./read-catalogs.ts";

const LOCALES = ["pt-BR", "en-US", "es-419"] as const;

const entries = (namespace: string, byLocale: Record<string, unknown>): CatalogEntry[] =>
  Object.entries(byLocale).map(([locale, messages]) => ({
    namespace,
    locale,
    messages,
    file: `${namespace}/${locale}`,
  }));

const check = (catalogs: CatalogEntry[]): string[] =>
  checkCatalogs(catalogs, { supportedLocales: LOCALES, sourceLocale: "pt-BR" });

describe("checkCatalogs", () => {
  it("accepts complete catalogs with matching placeholders", () => {
    const catalogs = entries("common", {
      "pt-BR": { greeting: "Olá, {name}", items: "{count, plural, one {# item} other {# itens}}" },
      "en-US": { greeting: "Hi, {name}", items: "{count, plural, one {# item} other {# items}}" },
      "es-419": { greeting: "Hola, {name}", items: "{count, plural, one {# ítem} other {# ítems}}" },
    });
    expect(check(catalogs)).toEqual([]);
  });

  it("reports a key missing in a locale and an extra key", () => {
    const catalogs = entries("common", {
      "pt-BR": { a: "A", nested: { b: "B" } },
      "en-US": { a: "A", extra: "X" },
      "es-419": { a: "A", nested: { b: "B" } },
    });
    expect(check(catalogs)).toEqual(["common/en-US: missing key nested.b", "common/en-US: key extra is not in pt-BR"]);
  });

  it("reports a placeholder mismatch", () => {
    const catalogs = entries("common", {
      "pt-BR": { greeting: "Olá, {name}" },
      "en-US": { greeting: "Hi, {userName}" },
      "es-419": { greeting: "Hola, {name}" },
    });
    expect(check(catalogs)).toEqual(["common/en-US: greeting placeholders {userName} differ from pt-BR {name}"]);
  });

  it("reports messages that are not valid ICU", () => {
    const catalogs = entries("common", {
      "pt-BR": { items: "{count, plural, one {# item}" },
      "en-US": { items: "{count, plural, one {# item} other {# items}}" },
      "es-419": { items: "{count, plural, one {# ítem} other {# ítems}}" },
    });
    expect(check(catalogs)[0]).toMatch(/^common\/pt-BR: items is not valid ICU/);
  });

  it("reports empty values, missing locales and unsupported locales", () => {
    const catalogs = entries("common", { "pt-BR": { a: "" }, "en-US": { a: "A" }, "fr-FR": { a: "A" } });
    expect(check(catalogs)).toEqual([
      "common/pt-BR: a is empty",
      "common: locale es-419 is missing",
      "common/fr-FR: locale fr-FR is not supported",
    ]);
  });

  it("reports a namespace without the source locale", () => {
    expect(check(entries("orphan", { "en-US": { a: "A" } }))).toContain("orphan: source locale pt-BR is missing");
  });
});

describe("reading catalogs from disk", () => {
  const fixtures = path.join(import.meta.dirname, "fixtures");

  it("reads core catalogs as <locale>/<namespace>.json", async () => {
    const catalogs = await readCoreCatalogs(path.join(fixtures, "core-messages"));
    expect(catalogs.map(({ namespace, locale }) => `${namespace}/${locale}`).sort()).toEqual([
      "common/en-US",
      "common/pt-BR",
    ]);
  });

  it("reads module catalogs as modules/<id>/src/messages/<locale>.json under the module namespace", async () => {
    const catalogs = await readModuleCatalogs(path.join(fixtures, "modules"));
    expect(catalogs.map(({ namespace, locale }) => `${namespace}/${locale}`).sort()).toEqual([
      "demo/es-419",
      "demo/pt-BR",
    ]);
  });

  it("returns no module catalogs when the modules folder does not exist", async () => {
    expect(await readModuleCatalogs(path.join(fixtures, "missing"))).toEqual([]);
  });
});
