import {
  ApprovalRequestIdSchema,
  CreateApprovalRequestInputSchema,
  ImpersonationSessionIdSchema,
  UserIdSchema,
  type UserPrincipal,
} from "@core/contracts";
import { describe, expect, it, vi } from "vitest";
import { nodes } from "./access-write.fixture.ts";
import { as, buildApprovalWorld, deleteInvoiceInput, tenantId } from "./approval.fixture.ts";

type World = Awaited<ReturnType<typeof buildApprovalWorld>>;

const request = async (world: World, uid = "member", input = deleteInvoiceInput()) => {
  const created = await world.services.requestApproval({
    principal: as(uid),
    access: world.access(),
    tenantId,
    input: CreateApprovalRequestInputSchema.parse(input),
    requestId: "r",
  });
  if (!created.ok) throw created.error;
  return created.data;
};

const decide = (world: World, verb: "approveRequest" | "rejectRequest", actor: UserPrincipal, id: string) =>
  world.services[verb]({
    actor,
    access: world.access(),
    approvalRequestId: ApprovalRequestIdSchema.parse(id),
    requestId: "r",
  });

describe("requestApproval", () => {
  it("creates a pending request for 7 days and audits a digest of the input", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    expect(created).toMatchObject({
      status: "pending",
      requestedBy: { type: "user", id: "member" },
      decidedBy: null,
      expiresAt: "2026-10-07T12:00:00.000Z",
    });
    expect(world.actions()).toContain("APPROVAL_REQUESTED");
  });

  it("refuses a caller without the permission, a permission without approval, an unknown kind and an invalid input", async () => {
    const world = await buildApprovalWorld();
    const run = (uid: string, input: Record<string, unknown>) =>
      world.services.requestApproval({
        principal: as(uid),
        access: world.access(),
        tenantId,
        input: CreateApprovalRequestInputSchema.parse(input),
        requestId: "r",
      });
    expect(await run("viewer", deleteInvoiceInput())).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
    expect(await run("member", { ...deleteInvoiceInput(), permission: "sample.invoice.read" })).toMatchObject({
      ok: false,
      error: { code: "APPROVAL_NOT_REQUIRED" },
    });
    const unknownKind = { ...deleteInvoiceInput(), action: { kind: "nobody-handles-this", input: {}, summary: "x" } };
    expect(await run("member", unknownKind)).toMatchObject({ ok: false, error: { code: "UNKNOWN_APPROVAL_ACTION" } });
    expect(await run("member", deleteInvoiceInput({ invoiceId: "" }))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", details: [{ field: "action.input.invoiceId", issue: "TOO_SMALL" }] },
    });
    expect(world.approvals.rowOf("approval-1")).toBeUndefined();
  });
});

describe("approveRequest", () => {
  it("never lets the requester decide (four eyes)", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world, "admin");
    expect(await decide(world, "approveRequest", as("admin"), created.id)).toMatchObject({
      ok: false,
      error: { code: "SELF_APPROVAL_FORBIDDEN" },
    });
    expect(await decide(world, "rejectRequest", as("admin"), created.id)).toMatchObject({
      ok: false,
      error: { code: "SELF_APPROVAL_FORBIDDEN" },
    });
  });

  it("refuses an impersonated approver and one lacking the action's permission", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    const impersonator: UserPrincipal = {
      ...as("owner"),
      impersonation: { sessionId: ImpersonationSessionIdSchema.parse("imp-1"), staffUid: UserIdSchema.parse("staff") },
    };
    expect(await decide(world, "approveRequest", impersonator, created.id)).toMatchObject({
      ok: false,
      error: { reason: "IMPERSONATION_READ_ONLY" },
    });
    const role = await world.accessServices.createRole({
      actor: as("owner"),
      access: world.access(),
      tenantId,
      input: { name: "Approver only", description: "", permissions: ["core.approval.read", "core.approval.decide"] },
      requestId: "r",
    });
    if (!role.ok) throw role.error;
    await world.grant("decider", nodes.orgA, [{ kind: "custom", roleId: role.data.id }]);
    expect(await decide(world, "approveRequest", as("decider"), created.id)).toMatchObject({
      ok: false,
      error: { reason: "PERMISSION_NOT_GRANTED" },
    });
    expect(await decide(world, "approveRequest", as("viewer"), created.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(world.executions).toEqual([]);
  });

  it("executes an approved request exactly once, even when approved twice", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    const approved = await decide(world, "approveRequest", as("admin"), created.id);
    expect(approved).toMatchObject({ ok: true, data: { status: "executed", decidedBy: "admin" } });
    expect(await decide(world, "approveRequest", as("owner"), created.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(world.executions).toHaveLength(1);
    expect(world.executions[0]).toMatchObject({
      input: { invoiceId: "inv-42" },
      context: { requester: { type: "user", uid: "member" }, approver: { uid: "admin" } },
    });
    expect(world.actions()).toEqual(
      expect.arrayContaining(["APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_EXECUTED"]),
    );
  });

  it("records a handler failure as failed without re-executing", async () => {
    const world = await buildApprovalWorld({ failWith: Object.assign(new Error("boom"), { code: "INVOICE_LOCKED" }) });
    const created = await request(world);
    const failure = { code: "INVOICE_LOCKED", requestId: "r" };
    expect(await decide(world, "approveRequest", as("admin"), created.id)).toMatchObject({
      ok: true,
      data: { status: "failed", failure },
    });
    expect(world.approvals.rowOf(created.id)?.failure).toEqual(failure);
    expect(world.actions()).toContain("APPROVAL_FAILED");
    expect(await decide(world, "approveRequest", as("owner"), created.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(world.executions).toHaveLength(1);
  });

  it("stores a generic code when the handler's error has no safe code, and no failure on success", async () => {
    const failing = await buildApprovalWorld({ failWith: new Error("SELECT * FROM invoices") });
    const created = await request(failing);
    expect(await decide(failing, "approveRequest", as("admin"), created.id)).toMatchObject({
      ok: true,
      data: { failure: { code: "APPROVAL_HANDLER_FAILED", requestId: "r" } },
    });
    const working = await buildApprovalWorld();
    const done = await request(working);
    await decide(working, "approveRequest", as("admin"), done.id);
    expect(working.approvals.rowOf(done.id)?.failure).toBeUndefined();
  });

  it("leaves an interrupted execution approved: listed by status for an operator, never re-executed", async () => {
    const world = await buildApprovalWorld({ hangOnExecute: true });
    const created = await request(world);
    void decide(world, "approveRequest", as("admin"), created.id);
    await vi.waitFor(() => expect(world.executions).toHaveLength(1));
    const stuck = await world.services.listApprovalRequests({
      actor: as("admin"),
      access: world.access(),
      tenantId,
      status: "approved",
      page: { after: undefined, limit: 20 },
    });
    expect(stuck).toMatchObject({
      ok: true,
      data: { items: [{ id: created.id, status: "approved", decidedBy: "admin" }] },
    });
    expect(await decide(world, "approveRequest", as("owner"), created.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(world.executions).toHaveLength(1);
    expect(world.actions()).not.toContain("APPROVAL_EXECUTED");
  });

  it("treats an expired request as no longer pending (409) and stores it as expired", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    world.setNow("2026-10-07T12:00:00.000Z");
    expect(await decide(world, "approveRequest", as("admin"), created.id)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(world.approvals.rowOf(created.id)?.status).toBe("expired");
  });
});

describe("rejectRequest and listApprovalRequests", () => {
  it("rejects a pending request and lists requests by effective status, newest first", async () => {
    const world = await buildApprovalWorld();
    const first = await request(world);
    world.setNow("2026-09-30T12:01:00.000Z");
    const second = await request(world);
    const rejected = await world.services.rejectRequest({
      actor: as("admin"),
      access: world.access(),
      approvalRequestId: first.id,
      reason: "Not now.",
      requestId: "r",
    });
    expect(rejected).toMatchObject({ ok: true, data: { status: "rejected", reason: "Not now." } });
    expect(world.actions()).toContain("APPROVAL_REJECTED");
    const list = (status?: "pending" | "rejected") =>
      world.services.listApprovalRequests({
        actor: as("member"),
        access: world.access(),
        tenantId,
        status,
        page: { after: undefined, limit: 20 },
      });
    const all = await list();
    if (!all.ok) throw all.error;
    expect(all.data.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(await list("pending")).toMatchObject({ ok: true, data: { items: [{ id: second.id }] } });
    world.setNow("2026-10-08T00:00:00.000Z");
    expect(await list("pending")).toMatchObject({ ok: true, data: { items: [] } });
    expect(
      await world.services.listApprovalRequests({
        actor: as("viewer"),
        access: world.access(),
        tenantId,
        page: { after: undefined, limit: 20 },
      }),
    ).toMatchObject({ ok: false });
  });
});
