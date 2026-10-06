import { describe, expect, it } from "vitest";
import { MyGrantContract, MyGrantSchema, MyGrantsQuerySchema } from "./my-grant.schema.ts";

describe("MyGrantSchema", () => {
  it("parses its catalog examples", () => {
    for (const example of MyGrantContract.meta.examples) expect(MyGrantSchema.safeParse(example).success).toBe(true);
  });

  it("requires at least one role", () => {
    expect(MyGrantSchema.safeParse({ node: { level: "organization", tenantId: "Org1" }, roles: [] }).success).toBe(
      false,
    );
  });
});

describe("MyGrantsQuerySchema", () => {
  it("requires the organization and pages by default", () => {
    expect(MyGrantsQuerySchema.safeParse({}).success).toBe(false);
    expect(MyGrantsQuerySchema.parse({ organizationId: "Org1" })).toEqual({ organizationId: "Org1", limit: 20 });
  });
});
