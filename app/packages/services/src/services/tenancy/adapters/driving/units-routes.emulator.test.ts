import { OrganizationIdSchema, ProjectIdSchema, UnitIdSchema, UserIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { buildEmulatorServer, clearCoreCollections, emulatorFirebase, ensureAuthUser, seedActiveUser } from "../../../shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const UNIT_TYPES = [
  { id: "sample.site", labelKey: "sample.unitTypes.site", allowedParents: ["project"] },
  { id: "sample.room", labelKey: "sample.unitTypes.room", allowedParents: ["sample.site", "sample.room"] },
];
const harness = buildEmulatorServer({ firebase, uids: ["owner", "u2"], modules: [{ id: "sample", unitTypes: UNIT_TYPES }] });

type Unit = { id: string; parentUnitId: string | null; ancestorIds: string[]; depth: number };
const dataOf = async <T>(response: Response) => ((await response.json()) as { data: T }).data;
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

let organizationId = "";
let projectId = "";

const createUnit = (name: string, type: string, parentUnitId: string | null = null) =>
  harness.call("tenancy.createUnit", { method: "POST", path: `/v1/projects/${projectId}/units`, as: "owner", body: { name, type, parentUnitId } });

const unitOf = async (name: string, type: string, parentUnitId: string | null = null): Promise<Unit> => {
  const response = await createUnit(name, type, parentUnitId);
  expect(response.status).toBe(201);
  return dataOf<Unit>(response);
};

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await ensureAuthUser(auth, "owner");
  const organization = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: "owner",
    body: { name: "Northwind", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  organizationId = (await dataOf<{ id: string }>(organization)).id;
  const project = await harness.call("tenancy.createProject", { method: "POST", path: `/v1/organizations/${organizationId}/projects`, as: "owner", body: { name: "Alpha" } });
  projectId = (await dataOf<{ id: string }>(project)).id;
});

describe("units routes (emulator)", () => {
  it("moves a unit and rewrites its descendants; a cycle answers 422", async () => {
    const siteA = await unitOf("A", "sample.site");
    const siteB = await unitOf("B", "sample.site");
    const room = await unitOf("Room", "sample.room", siteA.id);
    const inner = await unitOf("Inner", "sample.room", room.id);

    const moved = await harness.call("tenancy.updateUnit", { method: "PATCH", path: `/v1/units/${room.id}`, as: "owner", body: { parentUnitId: siteB.id } });
    expect(moved.status).toBe(200);
    expect(await dataOf<Unit>(moved)).toMatchObject({ parentUnitId: siteB.id, ancestorIds: [siteB.id], depth: 1 });
    const innerRead = await harness.call("tenancy.getUnit", { method: "GET", path: `/v1/units/${inner.id}`, as: "owner" });
    expect(await dataOf<Unit>(innerRead)).toMatchObject({ ancestorIds: [siteB.id, room.id], depth: 2 });

    const cycle = await harness.call("tenancy.updateUnit", { method: "PATCH", path: `/v1/units/${room.id}`, as: "owner", body: { parentUnitId: inner.id } });
    expect(cycle.status).toBe(422);
    expect(await codeOf(cycle)).toBe("INVALID_UNIT_PARENT");
  });

  it("refuses a seventh unit level (422 INVALID_UNIT_PARENT) and a type the parent does not allow", async () => {
    let parent = await unitOf("Site", "sample.site");
    for (let depth = 1; depth <= 6; depth += 1) parent = await unitOf(`Room ${depth}`, "sample.room", parent.id);
    expect(parent.depth).toBe(6);
    const tooDeep = await createUnit("Room 7", "sample.room", parent.id);
    expect(tooDeep.status).toBe(422);
    expect(await codeOf(tooDeep)).toBe("INVALID_UNIT_PARENT");
    const wrongType = await createUnit("Loose room", "sample.room");
    expect(wrongType.status).toBe(422);
  });

  it("gives a unit-level grant its unit and subtree only, never a sibling", async () => {
    const siteA = await unitOf("A", "sample.site");
    const siteB = await unitOf("B", "sample.site");
    const room = await unitOf("Room", "sample.room", siteA.id);
    await seedActiveUser(firestore, "u2");
    await firestore.runTransaction(async (tx) => {
      const plan = await harness.server.accessServices.prepareGrant(tx, {
        tenantId: OrganizationIdSchema.parse(organizationId),
        principal: { type: "user", id: "u2" },
        node: { level: "unit", tenantId: OrganizationIdSchema.parse(organizationId), projectId: ProjectIdSchema.parse(projectId), unitId: UnitIdSchema.parse(siteA.id) },
        roles: [{ kind: "system", key: "member" }],
        grantedBy: UserIdSchema.parse("owner"),
        actor: { type: "user", id: "owner" },
        requestId: "seed",
      });
      if (!plan.ok) throw plan.error;
      await plan.data.commit();
    });

    const read = (id: string) => harness.call("tenancy.getUnit", { method: "GET", path: `/v1/units/${id}`, as: "u2" });
    expect((await read(siteA.id)).status).toBe(200);
    expect((await read(room.id)).status).toBe(200);
    expect((await read(siteB.id)).status).toBe(404);
    const listed = await harness.call("tenancy.listUnits", { method: "GET", path: `/v1/projects/${projectId}/units`, as: "u2" });
    expect((await dataOf<Unit[]>(listed)).map((unit) => unit.id)).toEqual([siteA.id]);
  });

  it("soft-deletes a unit with its subtree (204) and lists the registered unit types", async () => {
    const site = await unitOf("A", "sample.site");
    const room = await unitOf("Room", "sample.room", site.id);
    const deleted = await harness.call("tenancy.deleteUnit", { method: "DELETE", path: `/v1/units/${site.id}`, as: "owner" });
    expect(deleted.status).toBe(204);
    const stored = (await firestore.collection(CORE_COLLECTIONS.units).doc(room.id).get()).data();
    expect(stored?.["deletedAt"]).not.toBeNull();

    const types = await harness.call("tenancy.listUnitTypes", { method: "GET", path: "/v1/unit-types", as: "owner" });
    expect((await dataOf<{ id: string }[]>(types)).map((type) => type.id)).toEqual(["sample.room", "sample.site"]);
  });
});
