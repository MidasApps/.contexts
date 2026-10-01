import { ApprovalRequestSchema, type ApprovalRequest, type ApprovalStatus } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { emulatorFirebase } from "../../../shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreApprovalRequestRepository } from "./firestore-approval-request-repository.ts";

// The cross-tenant sweep query (decisions 0030 A3 and 0036) against the Firestore emulator:
// equality on status, range on a timestamp field, oldest first.
const firebase = emulatorFirebase();
const repository = createFirestoreApprovalRequestRepository({ firestore: firebase.firestore });
const RUN = Date.now().toString(36);

const stored = async (args: { tenantId: string; status: ApprovalStatus; expiresAt: string; updatedAt: string }): Promise<ApprovalRequest> => {
  const request = ApprovalRequestSchema.parse({
    id: repository.newId(),
    tenantId: args.tenantId,
    node: { level: "organization", tenantId: args.tenantId },
    permission: "sample.invoice.delete",
    requestedBy: { type: "user", id: "member" },
    action: { kind: "sample-delete-invoice", input: { invoiceId: RUN }, summary: "Delete invoice" },
    status: args.status,
    decidedBy: args.status === "pending" ? null : "admin",
    reason: null,
    expiresAt: args.expiresAt,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: args.updatedAt,
  });
  await firebase.firestore.runTransaction((tx) => Promise.resolve(repository.create(tx, { request, actorId: "member" })));
  return request;
};

describe("approval-requests sweep query (Firestore emulator)", () => {
  it("lists one status across tenants up to a timestamp, oldest first, within the limit", async () => {
    // Far-past timestamps keep other tests' documents (which expire in 2026) out of the window.
    const older = await stored({ tenantId: `sweepA${RUN}`, status: "pending", expiresAt: "2001-01-01T00:00:00.000Z", updatedAt: "2001-01-01T00:00:00.000Z" });
    const newer = await stored({ tenantId: `sweepB${RUN}`, status: "pending", expiresAt: "2001-01-02T00:00:00.000Z", updatedAt: "2001-01-01T00:00:00.000Z" });
    await stored({ tenantId: `sweepA${RUN}`, status: "pending", expiresAt: "2001-01-05T00:00:00.000Z", updatedAt: "2001-01-01T00:00:00.000Z" });
    const approved = await stored({ tenantId: `sweepA${RUN}`, status: "approved", expiresAt: "2001-01-01T00:00:00.000Z", updatedAt: "2001-01-01T06:00:00.000Z" });
    const pending = await repository.listByStatusBefore({ status: "pending", field: "expiresAt", before: "2001-01-03T00:00:00.000Z", limit: 10 });
    const ours = pending.filter((request) => request.tenantId.endsWith(RUN));
    expect(ours.map((request) => request.id)).toEqual([older.id, newer.id]);
    expect(ours[0]).toEqual(older);
    const limited = await repository.listByStatusBefore({ status: "pending", field: "expiresAt", before: "2001-01-03T00:00:00.000Z", limit: 1 });
    expect(limited).toHaveLength(1);
    const stale = await repository.listByStatusBefore({ status: "approved", field: "updatedAt", before: "2001-01-01T12:00:00.000Z", limit: 10 });
    expect(stale.filter((request) => request.tenantId.endsWith(RUN)).map((request) => request.id)).toEqual([approved.id]);
  });
});
