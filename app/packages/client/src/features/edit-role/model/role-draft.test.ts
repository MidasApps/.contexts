import type { Role } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildRole } from "#/shared/testing/settings-fixtures.ts";
import { changedRole, draftOf, validateRoleDraft } from "./role-draft.ts";

describe("edit-role", () => {
  it("validates and patches only what changed (permission order ignored)", () => {
    const role = buildRole() as unknown as Role;
    expect(validateRoleDraft({ name: " ", description: "", permissions: [] })).toEqual({
      name: "required",
      permissions: true,
    });
    expect(changedRole(role, draftOf(role))).toBeNull();
    expect(changedRole(role, { ...draftOf(role), permissions: [...role.permissions].reverse() })).toBeNull();
    expect(changedRole(role, { ...draftOf(role), description: "New" })).toEqual({ description: "New" });
  });
});
