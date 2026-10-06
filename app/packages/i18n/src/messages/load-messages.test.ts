import { describe, expect, it } from "vitest";
import { loadMessages } from "./load-messages.ts";

describe("loadMessages", () => {
  it("returns core namespaces for the locale", () => {
    const messages = loadMessages("en-US");
    expect(messages.errors.NOT_FOUND).toBe("We couldn't find what you were looking for.");
    expect(messages.common.actions.save).toBe("Save");
  });

  it("merges module namespaces and falls back to pt-BR per key", () => {
    const messages = loadMessages("es-419", {
      example: { "pt-BR": { title: "Exemplo", hint: "Dica" }, "es-419": { title: "Ejemplo" } },
    });
    expect(messages["example"]).toEqual({ title: "Ejemplo", hint: "Dica" });
  });

  it("falls back to the source for a key missing in the locale", () => {
    const messages = loadMessages("en-US", { demo: { "pt-BR": { a: "A-pt", b: "B-pt" }, "en-US": { a: "A-en" } } });
    expect(messages["demo"]).toEqual({ a: "A-en", b: "B-pt" });
  });

  it("rejects extra namespaces that shadow a core namespace", () => {
    expect(() => loadMessages("pt-BR", { common: { "pt-BR": { a: "A" } } })).toThrow(/reserved/);
    expect(() => loadMessages("pt-BR", { errors: { "pt-BR": { a: "A" } } })).toThrow(/reserved/);
  });
});
