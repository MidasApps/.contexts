import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toEnvIssues } from "./env-issues.ts";

describe("toEnvIssues", () => {
  it("maps each Zod issue to its dotted field and upper-case code, never the value", () => {
    const result = z.object({ A: z.url(), B: z.object({ C: z.int() }) }).safeParse({ A: "s3cr3t", B: { C: "x" } });
    if (result.success) throw new Error("expected a parse failure");

    const issues = toEnvIssues(result.error);

    expect(issues).toEqual([
      { field: "A", issue: "INVALID_FORMAT" },
      { field: "B.C", issue: "INVALID_TYPE" },
    ]);
    expect(JSON.stringify(issues)).not.toContain("s3cr3t");
  });
});
