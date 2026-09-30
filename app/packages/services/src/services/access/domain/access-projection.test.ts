import { OrganizationIdSchema, ProjectIdSchema, UnitIdSchema, type TenantNodeRef } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildAccessProjection, nodeIdOf } from "./access-projection.ts";

const tenantId = OrganizationIdSchema.parse("org-a");
const org: TenantNodeRef = { level: "organization", tenantId };
const project = (id: string): TenantNodeRef => ({ level: "project", tenantId, projectId: ProjectIdSchema.parse(id) });
const unit = (projectId: string, id: string): TenantNodeRef => ({
  level: "unit",
  tenantId,
  projectId: ProjectIdSchema.parse(projectId),
  unitId: UnitIdSchema.parse(id),
});
const principal = { type: "user", id: "u1" } as const;

describe("buildAccessProjection", () => {
  it("marks an organization-level grant as org-wide", () => {
    expect(buildAccessProjection({ tenantId, principal, grants: [org] })).toEqual({
      tenantId,
      principalId: "u1",
      principalType: "user",
      orgWide: true,
      projectIds: [],
      unitIds: [],
      visibleProjectIds: [],
      isRevoked: false,
    });
  });

  it("lists project grants, unit grants and every project with a grant inside, sorted and unique", () => {
    const projection = buildAccessProjection({ tenantId, principal, grants: [unit("p2", "u9"), project("p1"), unit("p2", "u3"), unit("p1", "u3b")] });
    expect(projection).toMatchObject({
      orgWide: false,
      projectIds: ["p1"],
      unitIds: ["u3", "u3b", "u9"],
      visibleProjectIds: ["p1", "p2"],
      isRevoked: false,
    });
  });

  it("is revoked when no grant is left", () => {
    expect(buildAccessProjection({ tenantId, principal: { type: "device", id: "d1" }, grants: [] })).toMatchObject({
      principalType: "device",
      orgWide: false,
      isRevoked: true,
    });
  });

  it("is revoked when the organization is deleted, even with grants", () => {
    expect(buildAccessProjection({ tenantId, principal, grants: [org], organizationDeleted: true }).isRevoked).toBe(true);
  });

  it("ignores grants of another tenant", () => {
    const foreign: TenantNodeRef = { level: "organization", tenantId: OrganizationIdSchema.parse("org-b") };
    expect(buildAccessProjection({ tenantId, principal, grants: [foreign] })).toMatchObject({ orgWide: false, isRevoked: true });
  });
});

describe("nodeIdOf", () => {
  it("returns the tenant, project or unit id", () => {
    expect([nodeIdOf(org), nodeIdOf(project("p1")), nodeIdOf(unit("p1", "u1"))]).toEqual(["org-a", "p1", "u1"]);
  });
});
