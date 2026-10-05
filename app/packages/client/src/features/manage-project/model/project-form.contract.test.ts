import { describe, expect, it } from "vitest";
import { changedProject } from "./project-form.contract.ts";

describe("changedProject", () => {
  const initial = { name: "Launch", description: "Rollout." };

  it("sends only what changed", () => {
    expect(changedProject(initial, { name: "Launch 2", description: "Rollout." })).toEqual({ name: "Launch 2" });
  });

  it("removes an emptied description with null", () => {
    expect(changedProject(initial, { name: "Launch", description: "" })).toEqual({ description: null });
  });

  it("returns null when nothing changed", () => {
    expect(changedProject(initial, { ...initial })).toBeNull();
  });
});
