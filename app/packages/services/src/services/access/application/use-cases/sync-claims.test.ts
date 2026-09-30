import { OrganizationIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { makeAccessWriteWorld, nodes, system } from "./access-write.fixture.ts";

const uid = UserIdSchema.parse("u1");

describe("syncClaims", () => {
  it("projects the active organization only while its projection is live", async () => {
    const world = makeAccessWriteWorld();
    await world.grant("u1", nodes.orgA, [system("member")]);
    world.writes.putUser("u1", { accessVersion: 7, activeOrganizationId: OrganizationIdSchema.parse("org-a") });

    expect(await world.services.syncClaims(uid)).toBe(true);
    expect(world.writes.claims.claimsOf("u1")).toEqual({ accessVersion: 7, tenantId: "org-a" });

    world.writes.putUser("u1", { accessVersion: 8, activeOrganizationId: OrganizationIdSchema.parse("org-b") });
    await world.services.syncClaims(uid);
    expect(world.writes.claims.claimsOf("u1")).toEqual({ accessVersion: 8 });
  });

  it("adds the platform role of active staff only", async () => {
    const world = makeAccessWriteWorld();
    world.store.putPlatformStaff("u1", { role: "platform-support", isActive: true });
    await world.services.syncClaims(uid);
    expect(world.writes.claims.claimsOf("u1")).toEqual({ accessVersion: 0, platformRole: "platform-support" });

    world.store.putPlatformStaff("u1", { role: "platform-admin", isActive: false });
    await world.services.syncClaims(uid);
    expect(world.writes.claims.claimsOf("u1")).toEqual({ accessVersion: 0 });
  });

  it("returns false and logs when writing fails", async () => {
    const world = makeAccessWriteWorld();
    world.writes.claims.failNext();
    expect(await world.services.syncClaims(uid)).toBe(false);
    expect(world.logs).toMatchObject([{ message: "claims_sync_failed", userId: "u1" }]);
  });
});
