import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { MAX_UNIT_DEPTH, UnitContract, UnitSchema } from "./unit.schema.ts";

const ROOT = {
  id: EXAMPLE_IDS.unitRoot,
  tenantId: EXAMPLE_IDS.organization,
  projectId: EXAMPLE_IDS.project,
  parentUnitId: null,
  ancestorIds: [],
  depth: 0,
  type: "sample.site",
  name: "North site",
  settings: {},
  createdAt: EXAMPLE_TIMES.created,
  updatedAt: EXAMPLE_TIMES.updated,
};

const ancestors = (count: number) => Array.from({ length: count }, (_, index) => `ancestor-${index}`);

const atDepth = (depth: number) => {
  const ancestorIds = ancestors(depth);
  return { ...ROOT, id: "leaf", depth, ancestorIds, parentUnitId: ancestorIds.at(-1) ?? null };
};

describe("UnitSchema", () => {
  it("accepts a root unit (depth 0, no ancestors, no parent)", () => {
    expect(UnitSchema.safeParse(ROOT).success).toBe(true);
  });

  it(`accepts every depth up to ${MAX_UNIT_DEPTH}`, () => {
    for (let depth = 0; depth <= MAX_UNIT_DEPTH; depth += 1)
      expect(UnitSchema.safeParse(atDepth(depth)).success).toBe(true);
  });

  it("rejects a depth above the maximum", () => {
    expect(UnitSchema.safeParse(atDepth(MAX_UNIT_DEPTH + 1)).success).toBe(false);
  });

  it("requires ancestorIds to have exactly depth entries", () => {
    const result = UnitSchema.safeParse({ ...atDepth(2), depth: 3 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("ancestorIds");
  });

  it("requires the parent to be the last ancestor", () => {
    const result = UnitSchema.safeParse({ ...atDepth(2), parentUnitId: "ancestor-0" });
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("parentUnitId");
  });

  it("rejects a unit that is its own ancestor or repeats one", () => {
    expect(UnitSchema.safeParse({ ...atDepth(2), ancestorIds: ["leaf", "ancestor-1"] }).success).toBe(false);
    expect(
      UnitSchema.safeParse({ ...atDepth(2), ancestorIds: ["ancestor-1", "ancestor-1"], parentUnitId: "ancestor-1" })
        .success,
    ).toBe(false);
  });

  it("rejects a type that is not <module>.<type>", () => {
    expect(UnitSchema.safeParse({ ...ROOT, type: "site" }).success).toBe(false);
  });

  it("parses its catalog examples", () => {
    for (const example of UnitContract.meta.examples) expect(UnitSchema.safeParse(example).success).toBe(true);
  });
});
