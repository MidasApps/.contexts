import { describe, expect, it } from "vitest";
import { groupNavItems } from "./group-nav-items.ts";

describe("groupNavItems", () => {
  it("keeps each group's items in order, groups in the heading order, ungrouped items last under other", () => {
    const items = [
      { id: "traces", group: "operations" },
      { id: "module-a", group: undefined },
      { id: "general", group: "organization" },
      { id: "usage", group: "operations" },
      { id: "keys", group: "access" },
    ] as const;
    expect(groupNavItems(items, (item) => item.group).map(({ group, items: entries }) => [group, entries.map((entry) => entry.id)])).toEqual([
      ["organization", ["general"]],
      ["access", ["keys"]],
      ["operations", ["traces", "usage"]],
      ["other", ["module-a"]],
    ]);
  });

  it("returns no group for no items", () => {
    expect(groupNavItems([], () => undefined)).toEqual([]);
  });
});
