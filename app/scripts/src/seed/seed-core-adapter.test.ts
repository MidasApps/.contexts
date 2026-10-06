import { createLogger, type FirebaseAdmin } from "@core/services";
import { createCoreServer } from "@core/services/composition";
import { describe, expect, it } from "vitest";
import { SEED_UNIT_TYPE } from "./seed-core-adapter.ts";

// Adapters only keep references at construction; nothing here reaches Firebase.
const firebase = { app: {}, auth: {}, firestore: {} } as unknown as FirebaseAdmin;
const logger = createLogger({ context: { service: "test", env: "local" }, sink: () => undefined });

describe("seed unit type (follow-up #21)", () => {
  it("is registered by a server without modules, so any app can create and move seeded units", () => {
    const server = createCoreServer({ env: { API_KEY_PREFIX: "core" }, firebase, logger });
    expect(server.tenancy.unitTypes.allowsParent({ type: SEED_UNIT_TYPE, parent: "project" })).toBe(true);
    expect(server.tenancy.unitTypes.allowsParent({ type: SEED_UNIT_TYPE, parent: SEED_UNIT_TYPE })).toBe(true);
  });
});
