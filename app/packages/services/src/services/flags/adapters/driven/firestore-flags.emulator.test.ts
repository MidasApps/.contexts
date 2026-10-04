import { describe, expect, it } from "vitest";
import { emulatorFirebase } from "../../../shared/testing/core-server-emulator.fixture.ts";
import {
  createFirestoreEnvironmentFlagValues,
  createFirestoreTenantFlagOverrides,
  FEATURE_FLAGS_COLLECTION,
} from "./firestore-flags.ts";

const firebase = emulatorFirebase();
const RUN = Date.now().toString(36);

describe("Firestore flag stores (emulator)", () => {
  it("stores environment values per flag and tenant overrides per organization, dotted keys intact", async () => {
    const environment = createFirestoreEnvironmentFlagValues({ firestore: firebase.firestore });
    const tenants = createFirestoreTenantFlagOverrides({ firestore: firebase.firestore });
    const key = `test-${RUN}.kill`;
    await environment.write({ key, value: true, updatedBy: "staff" });
    await firebase.firestore.collection(FEATURE_FLAGS_COLLECTION).doc(`test-${RUN}.junk`).set({ value: "yes" });
    const read = await environment.read();
    expect(read[key]).toBe(true);
    expect(read).not.toHaveProperty(`test-${RUN}.junk`);

    const tenantA = `TenantA${RUN}`;
    await tenants.write({ key: "chat.voice", tenantId: tenantA, value: false, updatedBy: "staff" });
    await tenants.write({ key: "chat.voice.realtime", tenantId: tenantA, value: true, updatedBy: "admin" });
    expect(await tenants.read(tenantA)).toEqual({ "chat.voice": false, "chat.voice.realtime": true });
    expect(await tenants.read(`TenantB${RUN}`)).toEqual({});

    // Clearing removes exactly the dotted key, and tells when there was nothing to remove.
    expect(await tenants.clear({ key: "chat.voice", tenantId: tenantA, updatedBy: "staff" })).toBe(true);
    expect(await tenants.read(tenantA)).toEqual({ "chat.voice.realtime": true });
    expect(await tenants.clear({ key: "chat.voice", tenantId: tenantA, updatedBy: "staff" })).toBe(false);
    expect(await tenants.clear({ key: "chat.voice", tenantId: `TenantB${RUN}`, updatedBy: "staff" })).toBe(false);
  });
});
