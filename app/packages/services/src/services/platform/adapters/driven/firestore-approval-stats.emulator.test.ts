import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "#/services/shared/firestore/collections.ts";
import { emulatorFirebase } from "#/services/shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreApprovalStats } from "./firestore-approval-stats.ts";

const firebase = emulatorFirebase();
// A window no other suite writes in: the collection is shared by every emulator test file.
const WINDOW_START = new Date("2099-03-01T00:00:00.000Z");
const at = (iso: string) => Timestamp.fromDate(new Date(iso));

describe("Firestore approval stats (emulator)", () => {
  it("counts approved (executed and failed included) and rejected requests updated since the instant, across tenants", async () => {
    const requests = firebase.firestore.collection(CORE_COLLECTIONS.approvalRequests);
    const rows: [string, string, string][] = [
      ["tenantA", "approved", "2099-03-02T00:00:00.000Z"],
      ["tenantA", "executed", "2099-03-03T00:00:00.000Z"],
      ["tenantB", "failed", "2099-03-04T00:00:00.000Z"],
      ["tenantB", "rejected", "2099-03-05T00:00:00.000Z"],
      ["tenantA", "pending", "2099-03-05T00:00:00.000Z"],
      ["tenantA", "expired", "2099-03-05T00:00:00.000Z"],
      ["tenantB", "approved", "2099-02-27T00:00:00.000Z"],
      ["tenantB", "rejected", "2099-02-28T00:00:00.000Z"],
    ];
    await Promise.all(
      rows.map(([tenantId, status, updatedAt]) =>
        requests.doc().set({ tenantId, status, updatedAt: at(updatedAt), createdAt: at(updatedAt) }),
      ),
    );
    const stats = createFirestoreApprovalStats({ firestore: firebase.firestore });
    expect(await stats.countDecidedSince(WINDOW_START)).toEqual({ approved: 3, rejected: 1 });
  });
});
