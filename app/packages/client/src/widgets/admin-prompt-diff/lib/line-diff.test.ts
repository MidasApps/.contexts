import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "./line-diff.ts";

const compact = (before: string, after: string): string[] => diffLines(before, after).map((line) => `${line.kind === "same" ? " " : line.kind === "added" ? "+" : "-"}${line.text}`);

describe("diffLines", () => {
  it("marks a changed line as removed then added and keeps the lines around it", () => {
    expect(compact("You are the assistant.\nBe brief.\nCite sources.", "You are the assistant.\nBe concise.\nCite sources.")).toEqual([
      " You are the assistant.",
      "-Be brief.",
      "+Be concise.",
      " Cite sources.",
    ]);
  });

  it("reports only additions and only removals", () => {
    expect(compact("a\nb", "a\nb\nc")).toEqual([" a", " b", "+c"]);
    expect(compact("a\nb\nc", "a\nc")).toEqual([" a", "-b", " c"]);
  });

  it("treats identical texts as unchanged and ignores CRLF differences", () => {
    const lines = diffLines("a\r\nb", "a\nb");
    expect(lines.every((line) => line.kind === "same")).toBe(true);
    expect(diffStats(lines)).toEqual({ added: 0, removed: 0 });
  });

  it("handles an empty side", () => {
    expect(compact("", "a\nb")).toEqual(["+a", "+b"]);
    expect(compact("a", "")).toEqual(["-a"]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("keeps blank lines and repeated lines in place", () => {
    expect(compact("x\n\nx\ny", "x\n\ny")).toEqual([" x", " ", "-x", " y"]);
    expect(diffStats(diffLines("a\nb\nc", "c\nb\na"))).toEqual({ added: 2, removed: 2 });
  });
});
