import { describe, expect, it } from "vitest";
import { chunkDocument, estimateTokens } from "./chunk-document.ts";

const paragraph = (seed: string, words: number): string =>
  Array.from({ length: words }, (_, index) => `${seed}${index}`).join(" ");

describe("chunkDocument", () => {
  it("keeps a short document in one chunk and numbers chunks from 0", () => {
    expect(chunkDocument("# Guide\n\nMembers join after an owner approves them.", { format: "markdown" })).toEqual([
      {
        index: 0,
        text: "# Guide\n\nMembers join after an owner approves them.",
        tokenCount: estimateTokens("# Guide\n\nMembers join after an owner approves them."),
      },
    ]);
  });

  it("returns no chunk for empty or blank text", () => {
    expect(chunkDocument("")).toEqual([]);
    expect(chunkDocument(" \n\n\t ")).toEqual([]);
  });

  it("never exceeds maxSize and prefers heading boundaries in markdown", () => {
    const doc = ["# One", paragraph("a", 60), "## Two", paragraph("b", 60), "## Three", paragraph("c", 60)].join(
      "\n\n",
    );
    const chunks = chunkDocument(doc, { format: "markdown", maxSize: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(500);
    expect(chunks.some((chunk) => chunk.text.includes("## Two"))).toBe(true);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, position) => position));
  });

  it("repeats the tail of a chunk at the start of the next one", () => {
    const chunks = chunkDocument(paragraph("w", 400), { maxSize: 300, overlap: 60 });
    expect(chunks.length).toBeGreaterThan(3);
    for (let position = 1; position < chunks.length; position += 1) {
      const previousWords = (chunks[position - 1]?.text ?? "").split(" ");
      const firstWord = (chunks[position]?.text ?? "").split(" ")[0] ?? "";
      expect(previousWords).toContain(firstWord);
    }
  });

  it("cuts a single long token hard and normalizes line endings", () => {
    const chunks = chunkDocument(`start\r\n\r\n\r\n${"x".repeat(1200)}`, { maxSize: 400, overlap: 0 });
    expect(chunks.every((chunk) => chunk.text.length <= 400)).toBe(true);
    expect(chunks[0]?.text).not.toContain("\r");
  });

  it("is deterministic", () => {
    const doc = ["# A", paragraph("p", 300), "# B", paragraph("q", 300)].join("\n\n");
    expect(chunkDocument(doc, { format: "markdown" })).toEqual(chunkDocument(doc, { format: "markdown" }));
  });
});
