import { TenantNodeRefSchema, type MyGrant, type TenantNodeRef } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { IDS } from "#/shared/testing/fixtures.ts";
import { grantCoversNode } from "./use-my-grants.ts";

const ORG = IDS.organization;
const P1 = IDS.project;
const P2 = IDS.otherProject;
const U1 = IDS.unit;
const U2 = IDS.unitRoot;
const organization = TenantNodeRefSchema.parse({ level: "organization", tenantId: ORG });
const project = (projectId: string) => TenantNodeRefSchema.parse({ level: "project", tenantId: ORG, projectId });
const unit = (projectId: string, unitId: string) => TenantNodeRefSchema.parse({ level: "unit", tenantId: ORG, projectId, unitId });
const grantAt = (node: TenantNodeRef): Pick<MyGrant, "node"> => ({ node });

describe("grantCoversNode", () => {
  it("an organization grant covers every node of that organization, and none of another", () => {
    const grants = [grantAt(organization)];
    expect(grantCoversNode(grants, organization)).toBe(true);
    expect(grantCoversNode(grants, project(P1))).toBe(true);
    expect(grantCoversNode(grants, unit(P1, U1))).toBe(true);
    expect(grantCoversNode(grants, TenantNodeRefSchema.parse({ level: "organization", tenantId: IDS.otherOrganization }))).toBe(false);
  });

  it("a project grant covers its project and units, not the organization or another project", () => {
    const grants = [grantAt(project(P1))];
    expect(grantCoversNode(grants, project(P1))).toBe(true);
    expect(grantCoversNode(grants, unit(P1, U1))).toBe(true);
    expect(grantCoversNode(grants, organization)).toBe(false);
    expect(grantCoversNode(grants, project(P2))).toBe(false);
    expect(grantCoversNode(grants, unit(P2, U1))).toBe(false);
  });

  it("a unit grant never covers the project or the organization, and does not rule out units of its project", () => {
    const grants = [grantAt(unit(P1, U1))];
    expect(grantCoversNode(grants, unit(P1, U1))).toBe(true);
    expect(grantCoversNode(grants, unit(P1, U2))).toBe(true);
    expect(grantCoversNode(grants, project(P1))).toBe(false);
    expect(grantCoversNode(grants, organization)).toBe(false);
    expect(grantCoversNode(grants, unit(P2, U1))).toBe(false);
  });

  it("covers nothing without grants", () => {
    expect(grantCoversNode([], organization)).toBe(false);
  });
});
