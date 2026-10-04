// Test helper: the `/v1` routes a signed-in shell reads (me, access context by node, organizations,
// projects, units), with the permissions of the viewer at every node.
import type { Permission } from "@core/contracts";
import { type FakeRoutes, ok, page } from "#/shared/testing/fake-api.ts";
import {
  buildAccessContext,
  buildMe,
  buildOrganization,
  buildProject,
  buildUnit,
  IDS,
} from "#/shared/testing/fixtures.ts";

export const SHELL_ORGANIZATIONS = [
  buildOrganization(),
  buildOrganization({ id: IDS.otherOrganization, name: "Contoso" }),
];
export const SHELL_PROJECTS = [
  buildProject(),
  buildProject({ id: IDS.otherProject, name: "Beta", description: "Second project." }),
];
export const SHELL_UNITS = {
  site: buildUnit({ id: "site-1", name: "Site A", type: "sample.site" }),
  floor: buildUnit({ id: "floor-1", name: "Floor 2", ancestorIds: ["site-1"] }),
};

const unitsById: Record<string, Record<string, unknown>> = { "site-1": SHELL_UNITS.site, "floor-1": SHELL_UNITS.floor };

/** Routes of a shell where the viewer holds `permissions` at every node. */
export const shellRoutes = (permissions: readonly Permission[], overrides: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/me": ok(buildMe({ lastContext: { organizationId: IDS.organization } })),
  "GET /v1/me/context": (request) => {
    const organizationId = request.query.get("organizationId") ?? IDS.organization;
    const organization =
      SHELL_ORGANIZATIONS.find((candidate) => candidate.id === organizationId) ??
      buildOrganization({ id: organizationId });
    const projectId = request.query.get("projectId");
    const unitId = request.query.get("unitId");
    const project =
      projectId === null
        ? undefined
        : (SHELL_PROJECTS.find((candidate) => candidate.id === projectId) ?? buildProject({ id: projectId }));
    const unit = unitId === null ? undefined : unitsById[unitId];
    return ok(
      buildAccessContext({
        permissions,
        organization,
        ...(project === undefined ? {} : { project }),
        ...(unit === undefined ? {} : { unit }),
      }),
    );
  },
  "GET /v1/me/organizations": page(SHELL_ORGANIZATIONS),
  "GET /v1/organizations/:organizationId/projects": page(SHELL_PROJECTS),
  "GET /v1/projects/:projectId/units": (request) => {
    const parent = request.query.get("parentUnitId");
    if (parent === null) return page([SHELL_UNITS.site]);
    return page(parent === "site-1" ? [SHELL_UNITS.floor] : []);
  },
  "GET /v1/units/:unitId": (request) => ok(unitsById[request.params["unitId"] ?? ""] ?? SHELL_UNITS.site),
  ...overrides,
});

/** Everything a member typically holds (organization, projects, units). */
export const MEMBER_PERMISSIONS: readonly Permission[] = [
  "core.organization.read",
  "core.project.read",
  "core.project.create",
  "core.unit.read",
  "core.member.read",
];
