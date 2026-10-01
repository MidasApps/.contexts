import { describe, expect, it } from "vitest";
import { createCoreServer } from "./composition.ts";
import { SAMPLE_PERMISSIONS, SAMPLE_SETTINGS } from "./modules/application/use-cases/module-settings.fixture.ts";
import type { FirebaseAdmin } from "./shared/firebase/firebase-admin.ts";
import { createLogger } from "./shared/observability/logger.ts";

// Adapters only keep references at construction; nothing here reaches Firebase.
const firebase = { app: {}, auth: {}, firestore: {} } as unknown as FirebaseAdmin;
const logger = createLogger({ context: { service: "test", env: "local" }, sink: () => undefined });
const { moduleId, ...settings } = SAMPLE_SETTINGS;
const unitType = { id: "sample.area", labelKey: "sample.unitTypes.area", allowedParents: ["project"] };

describe("createCoreServer with module manifests (SP2 Task 9)", () => {
  it("serves the modules' settings and exposes their unit types", () => {
    const server = createCoreServer({
      env: { API_KEY_PREFIX: "core" },
      firebase,
      logger,
      modules: [{ id: moduleId, permissions: SAMPLE_PERMISSIONS, settings, unitTypes: [unitType] }, { id: "plain" }],
    });
    expect(Object.keys(server.routes)).toEqual(expect.arrayContaining(["modules.getModuleSettings", "modules.updateModuleSettings"]));
    expect(server.moduleSettings.registry.get("sample")?.updatePermission).toBe("sample.item.write");
    expect(server.moduleSettings.registry.get("plain")).toBeUndefined();
    expect(server.moduleUnitTypes).toEqual([unitType]);
  });
});
