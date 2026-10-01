import type { Unit, UnitTypeDefinition } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildUnit } from "#/shared/testing/fixtures.ts";
import { UNIT_TYPES } from "#/shared/testing/settings-fixtures.ts";
import { descendantIds, moveTargets, PROJECT_ROOT, typesAllowedUnder } from "./unit-tree-rules.ts";

describe("manage-units", () => {
  const units = [
    buildUnit({ id: "site-1", name: "Site A", type: "sample.site" }),
    buildUnit({ id: "site-2", name: "Site B", type: "sample.site" }),
    buildUnit({ id: "room-1", name: "Room", type: "sample.room", ancestorIds: ["site-1"] }),
  ] as unknown as Unit[];
  const types = UNIT_TYPES as unknown as UnitTypeDefinition[];

  it("offers the types a parent allows and lists descendants", () => {
    expect(typesAllowedUnder(types, "project").map((type) => type.id)).toEqual(["sample.site"]);
    expect(typesAllowedUnder(types, "sample.site").map((type) => type.id)).toEqual(["sample.room"]);
    expect([...descendantIds(units, "site-1")]).toEqual(["room-1"]);
  });

  it("moves only to allowed parents other than the current one, itself or its subtree", () => {
    const room = units[2] as Unit;
    const targets = moveTargets({ unit: room, units, types, projectLabel: "Launch", pathOf: (unit) => unit.name });
    expect(targets.map((target) => target.value)).toEqual(["site-2"]);
    const site = units[0] as Unit;
    expect(moveTargets({ unit: site, units, types, projectLabel: "Launch", pathOf: (unit) => unit.name })).toEqual([]);
    expect(PROJECT_ROOT).toBe("__project__");
  });
});
