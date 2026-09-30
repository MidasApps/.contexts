import type { TenantNodeRef, Unit } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { ids, userOf } from "../../../tenancy/application/use-cases/tenancy.fixture.ts";
import { makeMeWorld } from "./me.fixture.ts";

const setup = async () => {
  const world = makeMeWorld();
  const organization = await world.organizationOf("owner");
  const project = await world.tenancy.createProject({ ...world.command("owner"), tenantId: organization.id, input: { name: "Launch", settings: { timeZone: "America/Manaus" } } });
  if (!project.ok) throw project.error;
  const createUnit = async (name: string, type: string, parentUnitId: string | null, settings?: Unit["settings"]) => {
    const created = await world.tenancy.createUnit({
      ...world.command("owner"),
      projectId: project.data.id,
      input: { name, type, parentUnitId: parentUnitId === null ? null : ids.unit(parentUnitId), ...(settings === undefined ? {} : { settings }) },
    });
    if (!created.ok) throw created.error;
    return created.data;
  };
  const site = await createUnit("Site", "sample.site", null, { currency: "USD" });
  const room = await createUnit("Room", "sample.room", site.id);
  const unitNode: TenantNodeRef = { level: "unit", tenantId: organization.id, projectId: project.data.id, unitId: room.id };
  return { ...world, organization, project: project.data, site, room, unitNode };
};

describe("resolveAccessContext", () => {
  it("includes permissions granted at the organization when resolving a unit", async () => {
    const world = await setup();
    await world.grant("viewer", { level: "organization", tenantId: world.organization.id }, [{ kind: "system", key: "viewer" }]);
    await world.grant("viewer", world.unitNode, [{ kind: "system", key: "member" }]);

    const context = await world.identity.resolveAccessContext({ principal: userOf("viewer"), node: world.unitNode });

    expect(context).toMatchObject({ tenantId: world.organization.id, projectId: world.project.id, unitId: world.room.id, principal: userOf("viewer") });
    expect(context?.permissions).toEqual(expect.arrayContaining(["core.organization.read", "core.member.read"]));
    expect(context?.permissions).toEqual([...(context?.permissions ?? [])].sort());
  });

  it("answers null to an outsider, for a missing node and for the platform level", async () => {
    const world = await setup();
    world.store.putUser("outsider");
    expect(await world.identity.resolveAccessContext({ principal: userOf("outsider"), node: world.unitNode })).toBeNull();
    expect(await world.identity.resolveAccessContext({ principal: userOf("owner"), node: { ...world.unitNode, unitId: ids.unit("missing") } })).toBeNull();
    expect(await world.identity.resolveAccessContext({ principal: userOf("owner"), node: { level: "platform" } })).toBeNull();
  });

  it("resolves regional settings: user preference, then the nearest node, then the organization", async () => {
    const world = await setup();
    world.account("owner", { preferences: { locale: "es-419", theme: "system", notifications: { productUpdates: false, securityAlerts: true } } });
    const atUnit = await world.identity.resolveAccessContext({ principal: userOf("owner"), node: world.unitNode });
    // Room inherits the site's currency and the project's time zone; the user sets the locale only.
    expect(atUnit?.regional).toEqual({ locale: "es-419", displayTimeZone: "America/Manaus", nodeTimeZone: "America/Manaus", currency: "USD" });

    world.account("owner", { preferences: { timeZone: "Europe/Lisbon", theme: "system", notifications: { productUpdates: false, securityAlerts: true } } });
    const atOrganization = await world.identity.resolveAccessContext({ principal: userOf("owner"), node: { level: "organization", tenantId: world.organization.id } });
    expect(atOrganization?.regional).toEqual({ locale: "pt-BR", displayTimeZone: "Europe/Lisbon", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" });
  });
});
