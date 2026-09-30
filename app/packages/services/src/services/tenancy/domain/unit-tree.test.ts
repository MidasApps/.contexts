import { UnitIdSchema, type UnitId } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { placementUnder, planMove, type TreeUnit } from "./unit-tree.ts";

const id = (value: string): UnitId => UnitIdSchema.parse(value);

const unit = (value: string, ancestors: string[] = []): TreeUnit => ({
  id: id(value),
  parentUnitId: ancestors.length === 0 ? null : id(ancestors.at(-1) ?? ""),
  ancestorIds: ancestors.map(id),
  depth: ancestors.length,
});

// a > b > c ; a > d ; e (root)
const a = unit("a");
const b = unit("b", ["a"]);
const c = unit("c", ["a", "b"]);
const d = unit("d", ["a"]);
const e = unit("e");

describe("placementUnder", () => {
  it("places a unit directly under the project or below a parent unit", () => {
    expect(placementUnder(null)).toEqual({ parentUnitId: null, ancestorIds: [], depth: 0 });
    expect(placementUnder(c)).toEqual({ parentUnitId: "c", ancestorIds: ["a", "b", "c"], depth: 3 });
  });

  it("refuses a parent at the maximum depth (a seventh level)", () => {
    const deepest = unit("u6", ["u0", "u1", "u2", "u3", "u4", "u5"]);
    expect(deepest.depth).toBe(6);
    expect(placementUnder(deepest)).toBeNull();
  });
});

describe("planMove", () => {
  it("rewrites the unit and every descendant under the new parent", () => {
    const plan = planMove({ unit: b, newParent: e, descendants: [c] });
    expect(plan).toEqual({
      ok: true,
      rewrites: [
        { id: "b", parentUnitId: "e", ancestorIds: ["e"], depth: 1 },
        { id: "c", parentUnitId: "b", ancestorIds: ["e", "b"], depth: 2 },
      ],
    });
  });

  it("moves a subtree to the project root", () => {
    const plan = planMove({ unit: b, newParent: null, descendants: [c] });
    expect(plan).toMatchObject({ ok: true, rewrites: [{ id: "b", ancestorIds: [], depth: 0 }, { id: "c", ancestorIds: ["b"], depth: 1 }] });
  });

  it("refuses moving a unit under itself or its own descendant (cycle)", () => {
    expect(planMove({ unit: a, newParent: a, descendants: [b, c, d] })).toEqual({ ok: false, reason: "CYCLE" });
    expect(planMove({ unit: a, newParent: c, descendants: [b, c, d] })).toEqual({ ok: false, reason: "CYCLE" });
  });

  it("refuses a move that would push a descendant past the maximum depth", () => {
    const chain = unit("x5", ["x0", "x1", "x2", "x3", "x4"]);
    expect(planMove({ unit: b, newParent: chain, descendants: [c] })).toEqual({ ok: false, reason: "TOO_DEEP" });
  });

  it("refuses a subtree larger than the rewrite limit", () => {
    const descendants = Array.from({ length: 3 }, (_, index) => unit(`k${index}`, ["a"]));
    expect(planMove({ unit: a, newParent: e, descendants, maxSubtree: 3 })).toEqual({ ok: false, reason: "TOO_LARGE" });
  });

  it("heals descendants whose ancestors are stale (an interrupted move is retried)", () => {
    const stale = unit("c", ["old", "b"]);
    const moved = unit("b", ["e"]);
    expect(planMove({ unit: moved, newParent: e, descendants: [stale] })).toEqual({
      ok: true,
      rewrites: [{ id: "c", parentUnitId: "b", ancestorIds: ["e", "b"], depth: 2 }],
    });
  });
});
