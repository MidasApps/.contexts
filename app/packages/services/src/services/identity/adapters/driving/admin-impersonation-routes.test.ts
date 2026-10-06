import { type ImpersonationSession, ImpersonationSessionSchema } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { makeRecordAudit } from "#/services/audit/application/use-cases/record-audit.ts";
import { inMemoryUnitOfWork } from "#/services/shared/firestore/unit-of-work.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import {
  makeEndImpersonationSession,
  makeListImpersonationSessions,
} from "../../application/use-cases/admin-impersonation-sessions.ts";
import { createInMemoryImpersonationSessionRepository } from "../driven/in-memory-platform-repositories.ts";
import { buildAdminImpersonationRoutes } from "./admin-impersonation-routes.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const NOW = "2026-10-01T12:00:00.000Z";
const OPEN_A = "SessOpenAaaaaaaaaaaa";
const OPEN_B = "SessOpenBbbbbbbbbbbb";
const ENDED = "SessEndedaaaaaaaaaaa";
const EXPIRED = "SessExpiredaaaaaaaaa";
const NO_TX = Object.freeze({}) as Transaction;

const session = (id: string, overrides: Record<string, unknown> = {}): ImpersonationSession =>
  ImpersonationSessionSchema.parse({
    id,
    staffUid: "sue",
    targetUid: "alice",
    tenantId: ORG_A,
    reason: "Ticket 4821: user cannot see project Launch.",
    createdAt: "2026-10-01T11:30:00.000Z",
    expiresAt: "2026-10-01T12:30:00.000Z",
    endedAt: null,
    ...overrides,
  });

const SEED = [
  session(OPEN_A),
  session(OPEN_B, { staffUid: "sam", createdAt: "2026-10-01T11:50:00.000Z", expiresAt: "2026-10-01T12:10:00.000Z" }),
  session(ENDED, { createdAt: "2026-10-01T11:40:00.000Z", endedAt: "2026-10-01T11:45:00.000Z" }),
  session(EXPIRED, { createdAt: "2026-10-01T09:00:00.000Z", expiresAt: "2026-10-01T10:00:00.000Z" }),
];

const setup = () => {
  const { pipeline, auditLog, clock } = makeInMemoryPipeline({
    now: NOW,
    members: [{ uid: "alice", tenantId: ORG_A, role: "admin" }],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "nomfa", role: "platform-admin", mfa: false },
      { uid: "sue", role: "platform-support", mfa: true },
    ],
  });
  const impersonations = createInMemoryImpersonationSessionRepository();
  for (const row of SEED) impersonations.create(NO_TX, { session: row, actorId: row.staffUid });
  const deps = {
    impersonations,
    audit: makeRecordAudit({ writer: auditLog, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
  };
  const routes = buildAdminImpersonationRoutes({
    pipeline,
    platform: {
      listImpersonationSessions: makeListImpersonationSessions(deps),
      endImpersonationSession: makeEndImpersonationSession(deps),
    },
  });
  return { routes, auditLog, impersonations };
};

type Routes = ReturnType<typeof setup>["routes"];
type ListBody = {
  data: { id: string; status: string }[];
  meta: { page: { cursor: string | null; hasMore: boolean } };
  error?: { code: string };
};

const list = async (routes: Routes, search = "", as = "sam") => {
  const response = await callRoute(
    routes,
    "admin.listImpersonationSessions",
    `/v1/admin/impersonation-sessions${search}`,
    { as },
  );
  return { status: response.status, body: (await response.json()) as ListBody };
};
const end = (routes: Routes, id: string, as = "sam") =>
  callRoute(routes, "admin.endImpersonationSession", `/v1/admin/impersonation-sessions/${id}/end`, {
    method: "POST",
    as,
  });

describe("GET /v1/admin/impersonation-sessions", () => {
  it("is staff only: non-staff 403, staff without MFA MFA_REQUIRED, support staff may read", async () => {
    const { routes } = setup();
    expect((await list(routes, "", "alice")).status).toBe(403);
    expect((await list(routes, "", "nomfa")).body).toMatchObject({ error: { code: "MFA_REQUIRED" } });
    expect((await list(routes, "", "sue")).status).toBe(200);
  });

  it("lists every staff member's sessions newest first with their status, one cursor page at a time", async () => {
    const { routes } = setup();
    const first = await list(routes, "?limit=3");
    expect(first.body.data.map((row) => [row.id, row.status])).toEqual([
      [OPEN_B, "active"],
      [ENDED, "ended"],
      [OPEN_A, "active"],
    ]);
    expect(first.body.meta.page.hasMore).toBe(true);
    const second = await list(routes, `?limit=3&cursor=${first.body.meta.page.cursor ?? ""}`);
    expect(second.body.data.map((row) => [row.id, row.status])).toEqual([[EXPIRED, "expired"]]);
    expect(second.body.meta.page.hasMore).toBe(false);
    expect((await list(routes, "?cursor=not-a-cursor")).status).toBe(400);
  });

  it("lists only the open sessions, soonest expiry first", async () => {
    const { routes } = setup();
    const active = await list(routes, "?status=active");
    expect(active.body.data.map((row) => row.id)).toEqual([OPEN_B, OPEN_A]);
    expect(active.body.meta.page.hasMore).toBe(false);
  });
});

describe("POST /v1/admin/impersonation-sessions/{sessionId}/end", () => {
  it("refuses non-staff and staff without MFA, and leaves the session open", async () => {
    const { routes, impersonations } = setup();
    expect((await end(routes, OPEN_A, "alice")).status).toBe(403);
    expect((await end(routes, OPEN_A, "nomfa")).status).toBe(403);
    expect(impersonations.rowOf(OPEN_A)?.endedAt).toBeNull();
  });

  it("ends a colleague's open session and audits it on the platform log (who ended it) and the tenant log", async () => {
    const { routes, impersonations, auditLog } = setup();
    expect((await end(routes, OPEN_A)).status).toBe(204);
    expect(impersonations.rowOf(OPEN_A)?.endedAt).toBe(NOW);
    expect(auditLog.entries("platform")).toEqual([
      expect.objectContaining({
        action: "IMPERSONATION_ENDED",
        actor: { type: "user", id: "sam" },
        target: { type: "impersonation-session", id: OPEN_A },
        targetTenantId: ORG_A,
      }),
    ]);
    expect(auditLog.entries("tenant")).toEqual([
      expect.objectContaining({
        action: "IMPERSONATION_ENDED",
        tenantId: ORG_A,
        actor: { type: "user", id: "alice", onBehalfOf: "sue" },
      }),
    ]);
    expect((await list(routes, "?status=active")).body.data.map((row) => row.id)).toEqual([OPEN_B]);
  });

  it("is idempotent for ended and expired sessions (no write, no audit) and answers 404 for an unknown one", async () => {
    const { routes, impersonations, auditLog } = setup();
    expect((await end(routes, ENDED)).status).toBe(204);
    expect((await end(routes, EXPIRED)).status).toBe(204);
    expect(impersonations.rowOf(ENDED)?.endedAt).toBe("2026-10-01T11:45:00.000Z");
    expect(impersonations.rowOf(EXPIRED)?.endedAt).toBeNull();
    expect(auditLog.entries("platform")).toEqual([]);
    expect((await end(routes, "SessNoneaaaaaaaaaaaa")).status).toBe(404);
  });
});
