import { describe, expect, it } from "vitest";
import { emulatorFirebase } from "#/services/shared/testing/core-server-emulator.fixture.ts";
import { listLiveOrganizationIds } from "./firestore-live-organization-ids.ts";

// Platform listing of live organizations (SP5 usage-report) against the Firestore emulator.
const firebase = emulatorFirebase();
const RUN = Date.now().toString(36);

describe("listLiveOrganizationIds (Firestore emulator)", () => {
  it("lists live organizations only, ids only", async () => {
    const organizations = firebase.firestore.collection("organizations");
    await organizations.doc(`liveA${RUN}`).set({ name: "A", deletedAt: null });
    await organizations.doc(`liveB${RUN}`).set({ name: "B", deletedAt: null });
    await organizations.doc(`gone${RUN}`).set({ name: "C", deletedAt: "2026-09-01T00:00:00.000Z" });
    const ids = (await listLiveOrganizationIds(firebase.firestore)).filter((id) => id.endsWith(RUN));
    expect(ids.sort()).toEqual([`liveA${RUN}`, `liveB${RUN}`]);
  });
});
