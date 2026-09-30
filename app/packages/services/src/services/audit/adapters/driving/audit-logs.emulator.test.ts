import { OrganizationIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { buildEmulatorServer, clearCoreCollections, emulatorFirebase, ensureAuthUser, seedActiveUser } from "../../../shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const harness = buildEmulatorServer({ firebase, uids: ["al-owner", "al-other", "al-member"] });
let tenantId = OrganizationIdSchema.parse("unset");

type Listed = { data: { tenantId: string; action: string; occurredAt: string; actor: { id: string } }[]; meta: { page: { cursor: string | null; hasMore: boolean } } };

const createOrganization = async (as: string, name: string) => {
  await ensureAuthUser(auth, as);
  const response = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as,
    body: { name, defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  expect(response.status).toBe(201);
  return OrganizationIdSchema.parse(((await response.json()) as { data: { id: string } }).data.id);
};

const list = (as: string, query = "") => harness.call("audit.listAuditLogs", { method: "GET", path: `/v1/organizations/${tenantId}/audit-logs${query}`, as });

beforeEach(async () => {
  await clearCoreCollections(firestore);
  tenantId = await createOrganization("al-owner", "Audited Inc");
  await createOrganization("al-other", "Elsewhere Inc");
  await seedActiveUser(firestore, "al-member");
  const granted = await harness.call("access.grantMembership", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/memberships`,
    as: "al-owner",
    body: { userId: "al-member", node: { level: "organization", tenantId }, roles: [{ kind: "system", key: "member" }] },
  });
  expect(granted.status).toBe(201);
  const project = await harness.call("tenancy.createProject", { method: "POST", path: `/v1/organizations/${tenantId}/projects`, as: "al-owner", body: { name: "Launch" } });
  expect(project.status).toBe(201);
}, 30_000);

describe("audit log listing (emulator)", () => {
  it("lists the entries of earlier flows newest first, never another tenant's, with filters and a cursor", { timeout: 60_000 }, async () => {
    const response = await list("al-owner");
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as Listed;
    expect(data.every((entry) => entry.tenantId === tenantId)).toBe(true);
    expect(data.map((entry) => entry.action)).toEqual(expect.arrayContaining(["ORGANIZATION_CREATED", "MEMBERSHIP_GRANTED", "PROJECT_CREATED"]));
    const times = data.map((entry) => entry.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(data[0]?.action).toBe("PROJECT_CREATED");

    const onlyProjects = (await (await list("al-owner", "?action=PROJECT_CREATED&actorId=al-owner")).json()) as Listed;
    expect(onlyProjects.data.map((entry) => entry.action)).toEqual(["PROJECT_CREATED"]);
    const firstPage = (await (await list("al-owner", "?limit=1")).json()) as Listed;
    expect(firstPage.meta.page.hasMore).toBe(true);
    const next = (await (await list("al-owner", `?limit=1&cursor=${firstPage.meta.page.cursor ?? ""}`)).json()) as Listed;
    expect((next.data[0]?.occurredAt ?? "") <= (firstPage.data[0]?.occurredAt ?? "")).toBe(true);
    expect(next.data[0]).not.toEqual(firstPage.data[0]);
  });

  it("answers 403 to a member without core.audit-log.read and 404 to an outsider", { timeout: 60_000 }, async () => {
    expect((await list("al-member")).status).toBe(403);
    expect((await list("al-other")).status).toBe(404);
    expect((await list("al-owner", "?occurredAfter=2026-10-01T00:00:00.000Z&occurredBefore=2026-09-01T00:00:00.000Z")).status).toBe(400);
  });
});
