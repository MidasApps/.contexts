import { describe, expect, it } from "vitest";
import { buildSearchTokens, MAX_QUERY_TOKENS, queryTokens } from "./search-tokens.ts";

describe("buildSearchTokens", () => {
  it("folds accents and case, splits on punctuation and drops one-letter words", () => {
    expect(buildSearchTokens({ title: "Ação de Integração: plano A", summary: null })).toEqual([
      "acao",
      "de",
      "integracao",
      "plano",
    ]);
  });

  it("keeps title words first and removes repeats across title and summary", () => {
    expect(buildSearchTokens({ title: "Plano trimestral", summary: "O plano cobre vendas" })).toEqual([
      "plano",
      "trimestral",
      "cobre",
      "vendas",
    ]);
  });

  it("caps the tokens at 50", () => {
    const summary = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
    expect(buildSearchTokens({ title: null, summary })).toHaveLength(50);
  });

  it("returns no token for an untitled conversation", () => {
    expect(buildSearchTokens({ title: null, summary: null })).toEqual([]);
  });
});

describe("queryTokens", () => {
  it("folds a query like the stored tokens", () => {
    expect(queryTokens("  INTEGRAÇÃO, plano ")).toEqual(["integracao", "plano"]);
  });

  it("caps a query at the array-contains-any limit", () => {
    expect(queryTokens(Array.from({ length: 40 }, (_, index) => `w${index}`).join(" "))).toHaveLength(MAX_QUERY_TOKENS);
  });
});
