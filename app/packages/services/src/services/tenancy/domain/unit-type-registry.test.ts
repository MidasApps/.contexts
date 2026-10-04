import { describe, expect, it } from "vitest";
import { createUnitTypeRegistry, UnitTypeRegistryError } from "./unit-type-registry.ts";

const site = { id: "sample.site", labelKey: "sample.unitTypes.site", allowedParents: ["project"] };
const room = { id: "sample.room", labelKey: "sample.unitTypes.room", allowedParents: ["sample.site", "sample.room"] };

describe("createUnitTypeRegistry", () => {
  it("lists the types sorted by id and answers which parents each allows", () => {
    const registry = createUnitTypeRegistry([site, room]);
    expect(registry.list().map((type) => type.id)).toEqual(["sample.room", "sample.site"]);
    expect(registry.allowsParent({ type: "sample.site", parent: "project" })).toBe(true);
    expect(registry.allowsParent({ type: "sample.room", parent: "project" })).toBe(false);
    expect(registry.allowsParent({ type: "sample.room", parent: "sample.room" })).toBe(true);
    expect(registry.allowsParent({ type: "sample.unknown", parent: "project" })).toBe(false);
    expect(registry.get("sample.site")).toEqual(site);
  });

  it("registers nothing by default (the core declares no unit type)", () => {
    expect(createUnitTypeRegistry([]).list()).toEqual([]);
  });

  it("rejects duplicate ids and parents that are not registered types", () => {
    expect(() => createUnitTypeRegistry([site, site])).toThrow(UnitTypeRegistryError);
    expect(() => createUnitTypeRegistry([room])).toThrow(
      expect.objectContaining({ code: "UNKNOWN_PARENT_TYPE", unitTypeId: "sample.room" }),
    );
  });

  it("rejects an invalid definition", () => {
    expect(() => createUnitTypeRegistry([{ ...site, id: "Site" }])).toThrow(
      expect.objectContaining({ code: "INVALID_UNIT_TYPE" }),
    );
  });
});
