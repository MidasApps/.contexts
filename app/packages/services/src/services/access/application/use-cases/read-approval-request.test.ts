import { ApprovalRequestIdSchema, CreateApprovalRequestInputSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { as, buildApprovalWorld, deleteInvoiceInput, tenantId } from "./approval.fixture.ts";

type World = Awaited<ReturnType<typeof buildApprovalWorld>>;

const request = async (world: World) => {
  const created = await world.services.requestApproval({ principal: as("member"), access: world.access(), tenantId, input: CreateApprovalRequestInputSchema.parse(deleteInvoiceInput()), requestId: "r" });
  if (!created.ok) throw created.error;
  return created.data;
};

const read = (world: World, uid: string, id: string) => world.services.readApprovalRequest({ actor: as(uid), access: world.access(), approvalRequestId: ApprovalRequestIdSchema.parse(id) });

describe("readApprovalRequest", () => {
  it("answers the request with its effective status to a member of its organization", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    expect(await read(world, "admin", created.id)).toMatchObject({ ok: true, data: { id: created.id, status: "pending", action: { summary: "Delete invoice 42" } } });
    world.setNow("2026-10-08T12:00:00.000Z");
    expect(await read(world, "member", created.id)).toMatchObject({ ok: true, data: { status: "expired" } });
  });

  it("answers not found for an unknown id, a viewer without core.approval.read and a stranger, without telling them apart", async () => {
    const world = await buildApprovalWorld();
    const created = await request(world);
    expect(await read(world, "admin", "approval-missing")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await read(world, "viewer", created.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await read(world, "stranger", created.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
