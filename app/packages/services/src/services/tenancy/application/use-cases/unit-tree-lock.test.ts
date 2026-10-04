import type { Project, Unit } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createTenancyServices } from "../../composition.ts";
import { TREE_LOCK_LEASE_MS } from "../unit-tree-lock.ts";
import { ids, makeTenancyWorld, UNIT_TYPES } from "./tenancy.fixture.ts";

const START = "2026-09-30T12:00:00.000Z";

const setup = async () => {
  let now = Date.parse(START);
  const clock = { now: () => new Date(now) };
  const world = makeTenancyWorld({ clock });
  const organization = await world.organizationOf("owner");
  const created = await world.tenancy.createProject({
    ...world.command("owner"),
    tenantId: organization.id,
    input: { name: "Alpha" },
  });
  if (!created.ok) throw created.error;
  const project: Project = created.data;
  const unit = async (name: string, type: string, parentUnitId: string | null = null): Promise<Unit> => {
    const result = await world.tenancy.createUnit({
      ...world.command("owner"),
      projectId: project.id,
      input: { name, type, parentUnitId: parentUnitId === null ? null : ids.unit(parentUnitId) },
    });
    if (!result.ok) throw result.error;
    return result.data;
  };
  const move = (unitId: string, parentUnitId: string | null, tenancy = world.tenancy) =>
    tenancy.updateUnit({
      ...world.command("owner"),
      unitId: ids.unit(unitId),
      input: { parentUnitId: parentUnitId === null ? null : ids.unit(parentUnitId) },
    });
  const advance = (ms: number) => void (now += ms);
  return { ...world, clock, project, unit, move, advance };
};

type World = Awaited<ReturnType<typeof setup>>;

// Tenancy services whose subtree rewrite applies the batches, then dies (process crash).
const crashingTenancy = (world: World) =>
  createTenancyServices({
    unitTypes: UNIT_TYPES,
    ...world.tenancyStore,
    units: {
      ...world.tenancyStore.units,
      rewriteTree: async (args) => {
        await world.tenancyStore.units.rewriteTree(args);
        throw new Error("process died after the batches");
      },
    },
    access: world.services,
    accounts: { getProfile: (uid) => Promise.resolve({ email: `${uid}@example.com`, displayName: uid }) },
    audit: world.deps.audit,
    unitOfWork: world.deps.unitOfWork,
    clock: world.clock,
    selfServe: true,
  });

describe("unit tree lock", () => {
  it("serializes tree changes per project: a live lock answers 409 to moves, deletes and creates, not to renames", async () => {
    const world = await setup();
    const siteA = await world.unit("A", "sample.site");
    const siteB = await world.unit("B", "sample.site");
    const room = await world.unit("Room", "sample.room", siteA.id);
    await world.deps.unitOfWork.run((tx) => {
      world.tenancyStore.treeLocks.put(tx, {
        tenantId: world.project.tenantId,
        projectId: world.project.id,
        lockId: "other",
        operation: { kind: "delete", unitId: siteB.id },
        expiresAt: new Date(Date.parse(START) + TREE_LOCK_LEASE_MS).toISOString(),
      });
      return Promise.resolve();
    });

    expect(await world.move(room.id, siteB.id)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await world.tenancy.deleteUnit({ ...world.command("owner"), unitId: room.id })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    const create = await world.tenancy.createUnit({
      ...world.command("owner"),
      projectId: world.project.id,
      input: { name: "New", type: "sample.site", parentUnitId: null },
    });
    expect(create).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const rename = await world.tenancy.updateUnit({
      ...world.command("owner"),
      unitId: room.id,
      input: { name: "Renamed" },
    });
    expect(rename).toMatchObject({ ok: true, data: { name: "Renamed", parentUnitId: siteA.id } });
  });

  it("frees the lock after a move and after an expected refusal", async () => {
    const world = await setup();
    const siteA = await world.unit("A", "sample.site");
    const room = await world.unit("Room", "sample.room", siteA.id);
    expect((await world.move(room.id, null)).ok).toBe(false); // a room may not sit under the project
    expect(world.tenancyStore.treeLocks.lockOf(world.project.id)).toBeUndefined();
    const siteB = await world.unit("B", "sample.site");
    expect((await world.move(room.id, siteB.id)).ok).toBe(true);
    expect(world.tenancyStore.treeLocks.lockOf(world.project.id)).toBeUndefined();
  });

  it("finishes a move interrupted after its batches: retried at once, or resumed by the next change after the lease", async () => {
    const world = await setup();
    const siteA = await world.unit("A", "sample.site");
    const siteB = await world.unit("B", "sample.site");
    const room = await world.unit("Room", "sample.room", siteA.id);
    const inner = await world.unit("Inner", "sample.room", room.id);

    await expect(world.move(room.id, siteB.id, crashingTenancy(world))).rejects.toThrow("process died");
    // Half-done: the descendant is rebased, the moved unit is not, and the lock stays.
    expect(world.tenancyStore.unitRow(inner.id)?.ancestorIds).toEqual([siteB.id, room.id]);
    expect(world.tenancyStore.unitRow(room.id)?.parentUnitId).toBe(siteA.id);
    expect(world.tenancyStore.treeLocks.lockOf(world.project.id)?.operation).toEqual({
      kind: "move",
      unitId: room.id,
      parentUnitId: siteB.id,
    });

    // Another change waits for the lease, then finishes the abandoned move first.
    expect((await world.unit("Too soon", "sample.site").catch((e: unknown) => e)) instanceof Error).toBe(true);
    world.advance(TREE_LOCK_LEASE_MS);
    await world.unit("Later", "sample.site");
    expect(world.tenancyStore.unitRow(room.id)).toMatchObject({ parentUnitId: siteB.id, ancestorIds: [siteB.id] });
    expect(world.tenancyStore.unitRow(inner.id)).toMatchObject({ ancestorIds: [siteB.id, room.id], depth: 2 });
    expect(world.tenancyStore.treeLocks.lockOf(world.project.id)).toBeUndefined();
    expect(
      world.auditLog.entries("tenant").some((entry) => entry.action === "UNIT_MOVED" && entry.actor.type === "system"),
    ).toBe(true);
  });

  it("lets the same move be retried before the lease expires", async () => {
    const world = await setup();
    const siteA = await world.unit("A", "sample.site");
    const siteB = await world.unit("B", "sample.site");
    const room = await world.unit("Room", "sample.room", siteA.id);
    await world.unit("Inner", "sample.room", room.id);
    await expect(world.move(room.id, siteB.id, crashingTenancy(world))).rejects.toThrow();

    expect(await world.move(room.id, siteB.id)).toMatchObject({ ok: true, data: { parentUnitId: siteB.id } });
    expect(await world.move(siteA.id, null)).toMatchObject({ ok: true });
  });
});
