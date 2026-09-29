import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { createBoundariesConfig } from "./boundaries.js";

// The fixture tree mirrors the workspace layout (packages/<name>/src) so the
// element patterns are exercised exactly as they are in app/.
const FIXTURES_ROOT = path.join(import.meta.dirname, "fixtures");

const lintFixture = async (relativePath: string): Promise<ESLint.LintResult> => {
  const eslint = new ESLint({
    cwd: FIXTURES_ROOT,
    overrideConfigFile: true,
    overrideConfig: createBoundariesConfig({ rootPath: FIXTURES_ROOT }),
  });
  const [result] = await eslint.lintFiles([path.join(FIXTURES_ROOT, relativePath)]);
  if (!result) throw new Error(`no lint result for ${relativePath}`);
  return result;
};

describe("boundaries", () => {
  it("reports client importing services", async () => {
    const result = await lintFixture("packages/client/src/imports-services.ts");

    expect(result.messages.map((message) => message.ruleId)).toContain("boundaries/dependencies");
  });

  it("allows client importing contracts", async () => {
    const result = await lintFixture("packages/client/src/imports-contracts.ts");

    expect(result.messages).toEqual([]);
  });
});
