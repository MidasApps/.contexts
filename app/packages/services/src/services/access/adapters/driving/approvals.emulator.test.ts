import { OrganizationIdSchema, type PermissionDefinition } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AUDIT_LOG_COLLECTIONS } from "../../../audit/adapters/driven/firestore-audit-log-writer.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  emulatorFirebase,
  ensureAuthUser,
  seedActiveUser,
} from "../../../shared/testing/core-server-emulator.fixture.ts";

// A module permission that needs a second person; members hold it, admins may approve it.
const DELETE_INVOICE: PermissionDefinition = {
  id: "sample.invoice.delete",
  descriptionKey: "permissions.sample.invoice.delete",
  kind: "write",
  scope: "tenant",
  requiresApproval: true,
  defaultRoles: ["member"],
};

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const harness = buildEmulatorServer({
  firebase,
  uids: ["apr-owner", "apr-admin", "apr-member"],
  modules: [{ id: "sample", permissions: [DELETE_INVOICE] }],
});
const executed: unknown[] = [];
// Registered only in this test composition, after the server was built (the registry stays open).
harness.server.approvals.handlers.register({
  kind: "sample-delete-invoice",
  inputSchema: z.strictObject({ invoiceId: z.string().min(1) }),
  execute: (input) => Promise.resolve(void executed.push(input)),
});
let tenantId = OrganizationIdSchema.parse("unset");

const body = async (response: Response) =>
  (await response.json()) as {
    data?: Record<string, unknown> & { id: string; status: string };
    error?: { code: string };
  };

const grant = async (uid: string, key: "admin" | "member") => {
  await seedActiveUser(firestore, uid);
  const response = await harness.call("access.grantMembership", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/memberships`,
    as: "apr-owner",
    body: { userId: uid, node: { level: "organization", tenantId }, roles: [{ kind: "system", key }] },
  });
  expect(response.status).toBe(201);
};

const requestDeletion = (as: string, input: Record<string, unknown> = { invoiceId: "inv-42" }) =>
  harness.call("access.createApprovalRequest", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/approval-requests`,
    as,
    body: {
      node: { level: "organization", tenantId },
      permission: "sample.invoice.delete",
      action: { kind: "sample-delete-invoice", input, summary: "Delete invoice 42" },
    },
  });

const decide = (verb: "approve" | "reject", id: string, as: string) =>
  harness.call(`access.${verb}ApprovalRequest`, {
    method: "POST",
    path: `/v1/approval-requests/${id}/${verb}`,
    as,
    body: {},
  });

beforeEach(async () => {
  executed.length = 0;
  await clearCoreCollections(firestore);
  await ensureAuthUser(auth, "apr-owner");
  const created = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: "apr-owner",
    body: { name: "Approvals Inc", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  tenantId = OrganizationIdSchema.parse(((await created.json()) as { data: { id: string } }).data.id);
  await grant("apr-admin", "admin");
  await grant("apr-member", "member");
}, 30_000);

describe("approval requests (emulator)", () => {
  it("runs the four-eyes flow: request, self-approval refused, approval executes once, audit trail", {
    timeout: 60_000,
  }, async () => {
    const created = await requestDeletion("apr-member");
    expect(created.status).toBe(201);
    const request = (await body(created)).data;
    if (request === undefined) throw new Error("no request");
    expect(created.headers.get("location")).toBe(`/v1/approval-requests/${request.id}`);
    expect(request).toMatchObject({ status: "pending", requestedBy: { type: "user", id: "apr-member" } });

    // The Location is readable by a member of the organization; an unknown id is 404 (SP5 Task 14).
    const read = await harness.call("access.getApprovalRequest", {
      method: "GET",
      path: `/v1/approval-requests/${request.id}`,
      as: "apr-admin",
    });
    expect((await body(read)).data).toMatchObject({ id: request.id, status: "pending" });
    expect(
      (
        await harness.call("access.getApprovalRequest", {
          method: "GET",
          path: "/v1/approval-requests/NoSuchRequest0000000",
          as: "apr-admin",
        })
      ).status,
    ).toBe(404);

    const self = await decide("approve", request.id, "apr-member");
    expect(self.status).toBe(403);
    expect((await body(self)).error?.code).toBe("SELF_APPROVAL_FORBIDDEN");

    const approved = await decide("approve", request.id, "apr-admin");
    expect(approved.status).toBe(200);
    expect((await body(approved)).data).toMatchObject({ status: "executed", decidedBy: "apr-admin" });
    const again = await decide("approve", request.id, "apr-owner");
    expect(again.status).toBe(409);
    expect(executed).toEqual([{ invoiceId: "inv-42" }]);

    const pending = await harness.call("access.listApprovalRequests", {
      method: "GET",
      path: `/v1/organizations/${tenantId}/approval-requests?status=pending`,
      as: "apr-member",
    });
    expect(((await pending.json()) as { data: unknown[] }).data).toEqual([]);
    const all = await harness.call("access.listApprovalRequests", {
      method: "GET",
      path: `/v1/organizations/${tenantId}/approval-requests`,
      as: "apr-member",
    });
    expect(((await all.json()) as { data: { id: string; status: string }[] }).data).toMatchObject([
      { id: request.id, status: "executed" },
    ]);
    const actions = (
      await firestore.collection(AUDIT_LOG_COLLECTIONS.tenant).where("target.id", "==", request.id).get()
    ).docs.map((doc) => doc.get("action") as string);
    expect(actions.sort()).toEqual(["APPROVAL_APPROVED", "APPROVAL_EXECUTED", "APPROVAL_REQUESTED"]);
  });

  it("rejects a pending request once and refuses bad requests (422, 400, 403)", { timeout: 60_000 }, async () => {
    const request = (await body(await requestDeletion("apr-member"))).data;
    if (request === undefined) throw new Error("no request");
    expect((await decide("reject", request.id, "apr-admin")).status).toBe(200);
    expect((await decide("reject", request.id, "apr-admin")).status).toBe(409);
    expect(executed).toEqual([]);

    const unknownKind = await harness.call("access.createApprovalRequest", {
      method: "POST",
      path: `/v1/organizations/${tenantId}/approval-requests`,
      as: "apr-member",
      body: {
        node: { level: "organization", tenantId },
        permission: "sample.invoice.delete",
        action: { kind: "nobody-home", input: {}, summary: "x" },
      },
    });
    expect(unknownKind.status).toBe(422);
    expect((await body(unknownKind)).error?.code).toBe("UNKNOWN_APPROVAL_ACTION");
    expect((await requestDeletion("apr-member", { invoiceId: "" })).status).toBe(400);
    expect((await requestDeletion("apr-owner", { invoiceId: 7 })).status).toBe(400);
  });
});

describe("approval requests inbox queries (emulator)", () => {
  // The user menu badge asks for `?limit=100&status=pending` on every page of an organization.
  it("lists pending requests with a page limit, for the requester, an approver and the owner", {
    timeout: 60_000,
  }, async () => {
    const request = (await body(await requestDeletion("apr-member"))).data;
    if (request === undefined) throw new Error("no request");
    for (const as of ["apr-member", "apr-admin", "apr-owner"]) {
      for (const query of [
        "limit=100&status=pending",
        "limit=10",
        "limit=10&status=pending",
        "limit=1&status=expired",
      ]) {
        const response = await harness.call("access.listApprovalRequests", {
          method: "GET",
          path: `/v1/organizations/${tenantId}/approval-requests?${query}`,
          as,
        });
        expect(`${as} ${query} ${String(response.status)}`).toBe(`${as} ${query} 200`);
      }
    }
    const listed = await harness.call("access.listApprovalRequests", {
      method: "GET",
      path: `/v1/organizations/${tenantId}/approval-requests?limit=100&status=pending`,
      as: "apr-owner",
    });
    expect(((await listed.json()) as { data: { id: string }[] }).data).toMatchObject([
      { id: request.id, status: "pending" },
    ]);
  });
});
