import { ApprovalRequestIdSchema, CreateApprovalRequestInputSchema } from "@core/contracts";
import { describe, expect, it, vi } from "vitest";
import { as, buildApprovalWorld, deleteInvoiceInput, tenantId } from "./approval.fixture.ts";

type World = Awaited<ReturnType<typeof buildApprovalWorld>>;

const request = async (world: World, input = deleteInvoiceInput()) => {
  const created = await world.services.requestApproval({ principal: as("member"), access: world.access(), tenantId, input: CreateApprovalRequestInputSchema.parse(input), requestId: "r" });
  if (!created.ok) throw created.error;
  return created.data;
};

const approve = (world: World, id: string) =>
  world.services.approveRequest({ actor: as("admin"), access: world.access(), approvalRequestId: ApprovalRequestIdSchema.parse(id), requestId: "r" });

describe("getApprovalRequest (system read, decision 0036)", () => {
  it("returns the request with its effective status, or null", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    expect(await world.services.getApprovalRequest(created.id)).toMatchObject({ id: created.id, status: "pending" });
    world.setNow("2026-10-07T12:00:00.000Z");
    expect(await world.services.getApprovalRequest(created.id)).toMatchObject({ status: "expired" });
    expect(await world.services.getApprovalRequest(ApprovalRequestIdSchema.parse("missing"))).toBeNull();
  });
});

describe("expireApprovalRequests (approval-expiry-sweep)", () => {
  it("stores expired on overdue pending requests only, audited, without executing them", async () => {
    const world = await buildApprovalWorld();
    const overdue = await request(world);
    world.setNow("2026-10-05T12:00:00.000Z");
    const recent = await request(world);
    const decided = await request(world);
    await approve(world, decided.id);
    world.setNow("2026-10-07T12:00:00.000Z");
    expect(await world.services.expireApprovalRequests({ requestId: "sweep" })).toEqual({ expired: 1 });
    expect(world.approvals.rowOf(overdue.id)?.status).toBe("expired");
    expect(world.approvals.rowOf(recent.id)?.status).toBe("pending");
    expect(world.approvals.rowOf(decided.id)?.status).toBe("executed");
    expect(await world.services.expireApprovalRequests({ requestId: "sweep" })).toEqual({ expired: 0 });
    expect(world.executions).toHaveLength(1);
    // Audited once, by the system, in the sweep's transaction (SP5 Task 7).
    expect(world.auditEntries().filter((entry) => entry.action === "APPROVAL_EXPIRED")).toEqual([
      expect.objectContaining({ tenantId, actor: { type: "system", id: "system" }, target: { type: "approval-request", id: overdue.id }, outcome: "success", requestId: "sweep" }),
    ]);
  });
});

// Follow-up 82: a cancelled workflow run settles the request it waited for.
describe("cancelApprovalRequest (system, a cancelled workflow run)", () => {
  it("stores cancelled on a pending request, audited by the system, and then refuses decisions", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    expect(await world.services.cancelApprovalRequest({ id: created.id, requestId: "cancel" })).toEqual({ cancelled: true });
    expect(world.approvals.rowOf(created.id)?.status).toBe("cancelled");
    expect(world.auditEntries().filter((entry) => entry.action === "APPROVAL_CANCELLED")).toEqual([
      expect.objectContaining({ tenantId, actor: { type: "system", id: "system" }, target: { type: "approval-request", id: created.id }, outcome: "success", requestId: "cancel" }),
    ]);
    expect(await approve(world, created.id)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(world.executions).toHaveLength(0);
  });

  it("leaves decided, expired and unknown requests alone", async () => {
    const world = await buildApprovalWorld();
    const decided = await request(world);
    await approve(world, decided.id);
    const overdue = await request(world);
    world.setNow("2026-10-07T12:00:00.000Z");
    expect(await world.services.cancelApprovalRequest({ id: decided.id, requestId: "cancel" })).toEqual({ cancelled: false });
    expect(await world.services.cancelApprovalRequest({ id: overdue.id, requestId: "cancel" })).toEqual({ cancelled: false });
    expect(await world.services.cancelApprovalRequest({ id: ApprovalRequestIdSchema.parse("missing"), requestId: "cancel" })).toEqual({ cancelled: false });
    expect(world.approvals.rowOf(decided.id)?.status).toBe("executed");
    expect(world.auditEntries().some((entry) => entry.action === "APPROVAL_CANCELLED")).toBe(false);
  });
});

describe("failInterruptedApprovals (decision 0030 A3)", () => {
  it("fails requests still approved 15 minutes after updatedAt, audited, never re-executed", async () => {
    const world = await buildApprovalWorld({ hangOnExecute: true });
    const stuck = await request(world);
    void approve(world, stuck.id);
    await vi.waitFor(() => expect(world.executions).toHaveLength(1));
    world.setNow("2026-09-30T12:14:59.000Z");
    expect(await world.services.failInterruptedApprovals({ requestId: "sweep" })).toEqual({ failed: 0 });
    world.setNow("2026-09-30T12:15:00.000Z");
    expect(await world.services.failInterruptedApprovals({ requestId: "sweep" })).toEqual({ failed: 1 });
    expect(world.approvals.rowOf(stuck.id)?.status).toBe("failed");
    expect(world.auditEntries().filter((entry) => entry.action === "APPROVAL_FAILED")).toEqual([
      expect.objectContaining({ tenantId, actor: { type: "system", id: "system" }, target: { type: "approval-request", id: stuck.id }, outcome: "failed", metadata: { errorCode: "EXECUTION_INTERRUPTED" }, requestId: "sweep" }),
    ]);
    expect(await world.services.failInterruptedApprovals({ requestId: "sweep" })).toEqual({ failed: 0 });
    expect(world.executions).toHaveLength(1);
  });

  it("leaves executed and pending requests alone", async () => {
    const world = await buildApprovalWorld();
    const done = await request(world);
    await approve(world, done.id);
    await request(world);
    world.setNow("2026-10-01T12:00:00.000Z");
    expect(await world.services.failInterruptedApprovals({ requestId: "sweep" })).toEqual({ failed: 0 });
    expect(world.approvals.rowOf(done.id)?.status).toBe("executed");
  });
});
