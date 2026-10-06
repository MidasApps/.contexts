import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS } from "../example-values.ts";
import { NodeRefContract, NodeRefSchema, TenantNodeRefContract, TenantNodeRefSchema } from "./node-ref.schema.ts";

const { organization: tenantId, project: projectId, unit: unitId } = EXAMPLE_IDS;

describe("NodeRefSchema", () => {
  it("accepts every level with exactly its ids", () => {
    for (const node of [
      { level: "platform" },
      { level: "organization", tenantId },
      { level: "project", tenantId, projectId },
      { level: "unit", tenantId, projectId, unitId },
    ]) {
      expect(NodeRefSchema.parse(node)).toEqual(node);
    }
  });

  it("rejects a unit without its project and an unknown level", () => {
    expect(NodeRefSchema.safeParse({ level: "unit", tenantId, unitId }).success).toBe(false);
    expect(NodeRefSchema.safeParse({ level: "folder", tenantId }).success).toBe(false);
  });

  it("rejects ids that belong to another level", () => {
    expect(NodeRefSchema.safeParse({ level: "organization", tenantId, projectId }).success).toBe(false);
  });

  it("parses its catalog examples", () => {
    for (const example of NodeRefContract.meta.examples) expect(NodeRefSchema.safeParse(example).success).toBe(true);
    for (const example of TenantNodeRefContract.meta.examples)
      expect(TenantNodeRefSchema.safeParse(example).success).toBe(true);
  });
});

describe("TenantNodeRefSchema", () => {
  it("rejects the platform level", () => {
    expect(TenantNodeRefSchema.safeParse({ level: "platform" }).success).toBe(false);
    expect(TenantNodeRefSchema.safeParse({ level: "project", tenantId, projectId }).success).toBe(true);
  });
});
