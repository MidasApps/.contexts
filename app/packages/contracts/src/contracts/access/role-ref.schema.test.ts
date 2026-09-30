import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS } from "../example-values.ts";
import { MAX_ROLES_PER_GRANT, RoleRefContract, RoleRefListSchema, RoleRefSchema } from "./role-ref.schema.ts";

const owner = { kind: "system", key: "owner" };
const custom = { kind: "custom", roleId: EXAMPLE_IDS.role };

describe("RoleRefSchema", () => {
  it("accepts a system role key and a custom role id", () => {
    expect(RoleRefSchema.parse(owner)).toEqual(owner);
    expect(RoleRefSchema.parse(custom)).toEqual(custom);
  });

  it("rejects an unknown system key, a platform role and a custom ref without id", () => {
    expect(RoleRefSchema.safeParse({ kind: "system", key: "superuser" }).success).toBe(false);
    expect(RoleRefSchema.safeParse({ kind: "system", key: "platform-admin" }).success).toBe(false);
    expect(RoleRefSchema.safeParse({ kind: "custom" }).success).toBe(false);
    expect(RoleRefSchema.safeParse({ kind: "custom", roleId: EXAMPLE_IDS.role, key: "owner" }).success).toBe(false);
  });

  it("parses its catalog examples", () => {
    for (const example of RoleRefContract.meta.examples) expect(RoleRefSchema.safeParse(example).success).toBe(true);
  });
});

describe("RoleRefListSchema", () => {
  it(`holds 1-${MAX_ROLES_PER_GRANT} distinct roles`, () => {
    expect(RoleRefListSchema.safeParse([owner, custom]).success).toBe(true);
    expect(RoleRefListSchema.safeParse([]).success).toBe(false);
    expect(RoleRefListSchema.safeParse([owner, { ...owner }]).success).toBe(false);
    const eleven = Array.from({ length: MAX_ROLES_PER_GRANT + 1 }, (_, index) => ({ kind: "custom", roleId: `role-${index}` }));
    expect(RoleRefListSchema.safeParse(eleven).success).toBe(false);
  });
});
