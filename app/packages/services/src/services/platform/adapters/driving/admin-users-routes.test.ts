import { describe, expect, it } from "vitest";
import { createLogger } from "../../../shared/observability/logger.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import { createInMemoryAdminUserDirectory } from "../driven/in-memory-admin-user-directory.ts";
import { buildAdminUsersRoutes } from "./admin-users-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const USERS = [
  { id: "uAna", email: "ana@example.com", displayName: "Ana Souza" },
  { id: "uAndre", email: "andre@example.com", displayName: "André Lima" },
  { id: "uAnita", email: "anita@other.test", displayName: "anita" },
  { id: "uBob", email: "bob@example.com", displayName: "Bob", status: "disabled" as const },
  { id: "uBare", email: null, displayName: "" },
];

const setup = () => {
  const logs: unknown[] = [];
  const { pipeline, auditLog } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [{ uid: "alice", tenantId: ORG_A, role: "admin" }],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "nomfa", role: "platform-admin", mfa: false },
      { uid: "sue", role: "platform-support", mfa: true },
    ],
  });
  const users = createInMemoryAdminUserDirectory(USERS);
  const routes = buildAdminUsersRoutes({
    pipeline: {
      ...pipeline,
      logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => void logs.push(record) }),
    },
    users,
  });
  return { routes, auditLog, logs, users };
};

type ListBody = {
  data: { id: string; email: string | null; displayName: string; status: string }[];
  meta: { page: { cursor: string | null; hasMore: boolean; limit: number } };
};
const list = async (routes: ReturnType<typeof setup>["routes"], search: string, as = "sam") => {
  const response = await callRoute(routes, "admin.listUsers", `/v1/admin/users?${search}`, { as });
  return {
    status: response.status,
    body: (await response.json()) as ListBody & {
      error?: { code: string; details?: { field: string; issue: string }[] };
    },
  };
};
const idsOf = (body: ListBody) => body.data.map((user) => user.id);

describe("GET /v1/admin/users", () => {
  it("is staff only: non-staff 403, staff without MFA MFA_REQUIRED, support staff may search; denials are audited", async () => {
    const { routes, auditLog } = setup();
    expect((await list(routes, "query=ana", "alice")).status).toBe(403);
    expect((await list(routes, "query=ana", "nomfa")).body).toMatchObject({ error: { code: "MFA_REQUIRED" } });
    expect((await list(routes, "query=ana", "sue")).status).toBe(200);
    expect(auditLog.entries("platform").map((entry) => entry.action)).toEqual([
      "PLATFORM_ACCESS_DENIED",
      "PLATFORM_ACCESS_DENIED",
    ]);
  });

  it("finds by name prefix ignoring case and accents, ordered by name", async () => {
    const { routes } = setup();
    expect(idsOf((await list(routes, "query=AN")).body)).toEqual(["uAna", "uAndre", "uAnita"]);
    expect(idsOf((await list(routes, "query=andre")).body)).toEqual(["uAndre"]);
    expect(idsOf((await list(routes, `query=${encodeURIComponent("André l")}`)).body)).toEqual(["uAndre"]);
    expect((await list(routes, "query=zed")).body).toMatchObject({
      data: [],
      meta: { page: { cursor: null, hasMore: false } },
    });
  });

  it("reads a query with @ as an email prefix, lowercased", async () => {
    const { routes } = setup();
    expect(idsOf((await list(routes, `query=${encodeURIComponent("AN")}&by=email`)).body)).toEqual([
      "uAna",
      "uAndre",
      "uAnita",
    ]);
    expect(idsOf((await list(routes, `query=${encodeURIComponent("Ana@Example")}`)).body)).toEqual(["uAna"]);
  });

  it("answers the user whose id is the query, and only that with by=uid", async () => {
    const { routes } = setup();
    expect((await list(routes, "query=uBob")).body.data).toEqual([
      expect.objectContaining({ id: "uBob", status: "disabled", email: "bob@example.com" }),
    ]);
    expect((await list(routes, "query=uBare&by=uid")).body.data).toEqual([
      expect.objectContaining({ id: "uBare", email: null, displayName: "" }),
    ]);
    expect((await list(routes, "query=an&by=uid")).body.data).toEqual([]);
    expect(idsOf((await list(routes, "query=uBob&by=name")).body)).toEqual([]);
  });

  it("pages by cursor", async () => {
    const { routes } = setup();
    const first = (await list(routes, "query=an&limit=2")).body;
    expect(idsOf(first)).toEqual(["uAna", "uAndre"]);
    expect(first.meta.page).toMatchObject({ hasMore: true, limit: 2 });
    const second = (await list(routes, `query=an&limit=2&cursor=${first.meta.page.cursor}`)).body;
    expect(idsOf(second)).toEqual(["uAnita"]);
    expect(second.meta.page).toMatchObject({ cursor: null, hasMore: false });
    expect((await list(routes, "query=an&cursor=not-a-cursor")).body).toMatchObject({
      error: { code: "VALIDATION_FAILED", details: [{ field: "cursor", issue: "INVALID_CURSOR" }] },
    });
  });

  it("looks many ids up in one read, in the order asked, skipping unknown and repeated ids", async () => {
    const { routes, users } = setup();
    const { status, body } = await list(routes, "ids=uBob,nope,uAna,uBob");
    expect(status).toBe(200);
    expect(idsOf(body)).toEqual(["uBob", "uAna"]);
    expect(body.meta.page).toMatchObject({ cursor: null, hasMore: false });
    expect(users.reads).toEqual([{ kind: "getMany", count: 3 }]);
  });

  it("refuses no criteria, both criteria and more than 100 ids, never echoing the text", async () => {
    const { routes } = setup();
    const none = await list(routes, "limit=5");
    expect(none.status).toBe(400);
    expect(none.body.error?.details).toEqual([{ field: "query", issue: "REQUIRED" }]);
    const both = await list(routes, "query=ana&ids=uAna");
    expect(both.body.error?.details).toEqual([{ field: "ids", issue: "NOT_WITH_QUERY" }]);
    const many = await list(routes, `ids=${Array.from({ length: 101 }, (_, index) => `u${index}`).join(",")}`);
    expect(many.body.error?.details).toEqual([{ field: "ids", issue: "TOO_MANY" }]);
    expect(JSON.stringify([none.body, both.body, many.body])).not.toContain("ana");
  });

  it("never logs the search text", async () => {
    const { routes, logs } = setup();
    await list(routes, `query=${encodeURIComponent("ana@example.com")}`);
    expect(JSON.stringify(logs)).not.toContain("ana@example.com");
  });
});
