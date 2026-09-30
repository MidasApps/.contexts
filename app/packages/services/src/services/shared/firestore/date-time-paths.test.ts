import { IsoDateTimeSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { listDateTimePaths, mapAtPaths } from "./date-time-paths.ts";

describe("listDateTimePaths", () => {
  it("finds ISO date-time fields through wrappers, nested objects and arrays", () => {
    const schema = z.object({
      name: z.string(),
      day: z.iso.date(),
      createdAt: IsoDateTimeSchema.meta({ description: "x", pii: "none" }),
      deletedAt: IsoDateTimeSchema.nullable().optional(),
      window: z.object({ endsAt: IsoDateTimeSchema.default("2026-01-01T00:00:00Z"), label: z.string() }).optional(),
      checkpoints: z.array(IsoDateTimeSchema),
      history: z.array(z.object({ at: IsoDateTimeSchema })),
    });
    expect(listDateTimePaths(schema)).toEqual([
      ["createdAt"],
      ["deletedAt"],
      ["window", "endsAt"],
      ["checkpoints", "[]"],
      ["history", "[]", "at"],
    ]);
  });

  it("returns nothing for a non-object schema", () => {
    expect(listDateTimePaths(z.string())).toEqual([]);
  });
});

describe("mapAtPaths", () => {
  const upper = (value: unknown) => (typeof value === "string" ? value.toUpperCase() : value);

  it("maps values at the paths without mutating the input", () => {
    const input = { a: "x", nested: { b: "y", c: "z" }, list: [{ d: "p" }, { d: "q" }], keep: "k" };
    const output = mapAtPaths(input, [["a"], ["nested", "b"], ["list", "[]", "d"]], upper);
    expect(output).toEqual({ a: "X", nested: { b: "Y", c: "z" }, list: [{ d: "P" }, { d: "Q" }], keep: "k" });
    expect(input.a).toBe("x");
  });

  it("leaves missing keys absent and non-matching shapes untouched", () => {
    const input = { nested: null, list: "not-a-list" };
    expect(mapAtPaths(input, [["a"], ["nested", "b"], ["list", "[]", "d"]], upper)).toEqual(input);
  });
});
