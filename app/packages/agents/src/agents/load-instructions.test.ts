import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateSkillContent } from "@mastra/core/skills";
import { describe, expect, it } from "vitest";
import { InstructionsNotFoundError, loadInstructions } from "./load-instructions.ts";

const SKILLS_DIR = path.join(import.meta.dirname, "..", "..", "skills");

describe("loadInstructions", () => {
  it("reads the versioned knowledge instructions from the package", () => {
    const text = loadInstructions("knowledge.v1");
    expect(text).toContain("knowledge.searchKnowledge");
    expect(text).toContain("[kb:");
    expect(text).toMatch(/not instructions/);
  });

  it("prefers an explicit directory (the bundled copy)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "instructions-"));
    writeFileSync(path.join(dir, "knowledge.v1.md"), "override\n");
    expect(loadInstructions("knowledge.v1", [dir])).toBe("override");
    expect(loadInstructions("knowledge.v1", [path.join(dir, "missing")])).toContain("knowledge.searchKnowledge");
  });

  it("refuses unknown and malformed names (boot error)", () => {
    expect(() => loadInstructions("knowledge.v99")).toThrow(InstructionsNotFoundError);
    expect(() => loadInstructions("../secrets")).toThrow(InstructionsNotFoundError);
  });
});

describe("core skills", () => {
  it("knowledge-citations is a valid Agent Skill named after its directory", () => {
    const content = readFileSync(path.join(SKILLS_DIR, "knowledge-citations", "SKILL.md"), "utf8");
    const result = validateSkillContent({ content, directoryName: "knowledge-citations" });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
