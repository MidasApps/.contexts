import { type ImpersonationSession, ImpersonationSessionSchema, type PlatformStaff } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { makeRecordAudit } from "#/services/audit/application/use-cases/record-audit.ts";
import { inMemoryUnitOfWork } from "#/services/shared/firestore/unit-of-work.ts";
import { createLogger } from "#/services/shared/observability/logger.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import { createPlatformServices } from "../../platform-composition.ts";
import { createFakeFirebaseAuth } from "../driven/fake-firebase-auth.ts";
import {
  createInMemoryImpersonationSessionRepository,
  createInMemoryPlatformStaffRepository,
} from "../driven/in-memory-platform-repositories.ts";
import { buildAdminStaffRoutes } from "./admin-staff-routes.ts";

const NOW = "2026-10-01T12:00:00.000Z";
const NO_TX = Object.freeze({}) as Transaction;

const staffRow = (uid: string, role: PlatformStaff["role"]): PlatformStaff =>
  ({ uid, role, isActive: true, createdAt: NOW, updatedAt: NOW }) as PlatformStaff;

const openSession = (staffUid: string): ImpersonationSession =>
  ImpersonationSessionSchema.parse({
    id: `Sess${staffUid}aaaaaaaaaaaaaaaa`.slice(0, 20),
    staffUid,
    targetUid: "alice",
    tenantId: "OrgAaaaaaaaaaaaaaaaaa",
    reason: "Ticket 4821: user cannot see project Launch.",
    createdAt: "2026-10-01T11:50:00.000Z",
    expiresAt: "2026-10-01T12:30:00.000Z",
    endedAt: null,
  });

const setup = () => {
  const { pipeline, auditLog, clock } = makeInMemoryPipeline({
    now: NOW,
    members: [{ uid: "alice", tenantId: "OrgAaaaaaaaaaaaaaaaaa", role: "admin" }],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "sue", role: "platform-support", mfa: true },
    ],
  });
  const staff = createInMemoryPlatformStaffRepository();
  staff.put(NO_TX, { staff: staffRow("sam", "platform-admin"), actorId: "system" });
  staff.put(NO_TX, { staff: staffRow("sue", "platform-support"), actorId: "system" });
  const impersonations = createInMemoryImpersonationSessionRepository();
  impersonations.create(NO_TX, { session: openSession("sue"), actorId: "sue" });
  const synced: string[] = [];
  const platform = createPlatformServices({
    staff,
    users: { exists: (uid) => Promise.resolve(uid !== "ghost") },
    impersonations,
    customTokens: createFakeFirebaseAuth().customTokens,
    syncClaims: (uid) => (synced.push(uid), Promise.resolve(true)),
    audit: makeRecordAudit({ writer: auditLog, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
  });
  const routes = buildAdminStaffRoutes({ pipeline, platform });
  return { routes, staff, impersonations, auditLog, synced };
};

describe("/v1/admin/staff", () => {
  it("lists staff to platform admins only", async () => {
    const { routes } = setup();
    const listed = await callRoute(routes, "admin.listStaff", "/v1/admin/staff", { as: "sam" });
    expect(((await listed.json()) as { data: { uid: string }[] }).data.map((row) => row.uid)).toEqual(["sam", "sue"]);
    expect((await callRoute(routes, "admin.listStaff", "/v1/admin/staff", { as: "sue" })).status).toBe(403);
    expect((await callRoute(routes, "admin.listStaff", "/v1/admin/staff", { as: "alice" })).status).toBe(403);
  });

  it("grants a role to a user, changes it, syncs claims and audits, but never one's own or a missing user", async () => {
    const { routes, staff, auditLog, synced } = setup();
    const put = (userId: string, role: string) =>
      callRoute(routes, "admin.setStaffRole", `/v1/admin/staff/${userId}`, {
        method: "PUT",
        as: "sam",
        body: { role },
      });
    expect(await (await put("bruno", "platform-support")).json()).toMatchObject({
      data: { uid: "bruno", role: "platform-support", isActive: true },
    });
    expect((await put("sue", "platform-admin")).status).toBe(200);
    expect(staff.rowOf("sue")?.role).toBe("platform-admin");
    expect(await (await put("sam", "platform-support")).json()).toMatchObject({ error: { code: "STAFF_SELF_CHANGE" } });
    expect((await put("ghost", "platform-support")).status).toBe(404);
    expect(synced).toEqual(["bruno", "sue"]);
    expect(
      auditLog.entries("platform").map((entry) => [entry.action, entry.actor.id, entry.target.id, entry.changes]),
    ).toEqual([
      ["PLATFORM_STAFF_GRANTED", "sam", "bruno", undefined],
      ["PLATFORM_STAFF_GRANTED", "sam", "sue", ["role", "isActive"]],
    ]);
  });

  it("revokes a staff member, ending their open support sessions, but never oneself", async () => {
    const { routes, staff, impersonations, auditLog, synced } = setup();
    const revoke = (userId: string) =>
      callRoute(routes, "admin.revokeStaff", `/v1/admin/staff/${userId}`, { method: "DELETE", as: "sam" });
    expect((await revoke("sue")).status).toBe(204);
    expect(staff.rowOf("sue")?.isActive).toBe(false);
    expect(impersonations.rowOf(openSession("sue").id)?.endedAt).not.toBeNull();
    expect((await revoke("sue")).status).toBe(404);
    expect(await (await revoke("sam")).json()).toMatchObject({ error: { code: "STAFF_SELF_CHANGE" } });
    expect(synced).toEqual(["sue"]);
    expect(auditLog.entries("platform").map((entry) => entry.action)).toEqual([
      "PLATFORM_STAFF_REVOKED",
      "IMPERSONATION_ENDED",
    ]);
  });
});
