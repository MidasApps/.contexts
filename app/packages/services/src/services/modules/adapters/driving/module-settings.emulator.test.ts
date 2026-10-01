import type { Principal } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryAccessStore } from "../../../access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "../../../access/composition.ts";
import { AUDIT_LOG_COLLECTIONS, createFirestoreAuditLogWriter } from "../../../audit/adapters/driven/firestore-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createFirebaseAdmin } from "../../../shared/firebase/firebase-admin.ts";
import type { ApiRouteDeps } from "../../../shared/http/api-route.ts";
import { createInMemoryIdempotencyStore } from "../../../shared/idempotency/in-memory-idempotency-store.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createInMemoryRateLimiter } from "../../../shared/rate-limit/in-memory-rate-limiter.ts";
import { NOW, SAMPLE_PERMISSIONS, SAMPLE_SETTINGS, user, validValues } from "../../application/use-cases/module-settings.fixture.ts";
import { createFirestoreModuleSettingsServices } from "../../composition.ts";
import { MODULE_SETTINGS_COLLECTION } from "../driven/firestore-module-settings-repository.ts";
import { buildModuleSettingsRoutes } from "./module-settings-routes.ts";

// Runs inside `firebase emulators:exec`, which exports FIRESTORE_EMULATOR_HOST.
const { firestore } = createFirebaseAdmin({ env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" }, processEnv: process.env });

// Access decisions come from the in-memory readers; the store and the audit log are Firestore.
const buildRoutes = () => {
  const clock = fixedClock(NOW);
  const store = createInMemoryAccessStore();
  store.putOrganization({ id: "org-a" });
  for (const uid of ["owner-1", "viewer-1", "stranger"]) store.putUser(uid);
  store.putGrant({ tenantId: "org-a", principalId: "owner-1", nodeId: "org-a", roles: [{ kind: "system", key: "owner" }] });
  store.putGrant({ tenantId: "org-a", principalId: "viewer-1", nodeId: "org-a", roles: [{ kind: "system", key: "viewer" }] });
  const audit = makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore }), clock });
  const principals: Record<string, Principal> = { owner: user("owner-1"), viewer: user("viewer-1"), stranger: user("stranger") };
  const pipeline: ApiRouteDeps = {
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
    clock,
    rateLimiter: createInMemoryRateLimiter({ clock }),
    idempotency: createInMemoryIdempotencyStore({ clock }),
    verifyBearer: ({ token }) => Promise.resolve(principals[token] ?? null),
    apiKeyPrefix: "core",
    access: createAccessCore({ permissions: [{ moduleId: "sample", permissions: SAMPLE_PERMISSIONS }], readers: store, clock }),
    audit,
  };
  const moduleSettings = createFirestoreModuleSettingsServices({ firestore, definitions: [SAMPLE_SETTINGS], audit, clock });
  return buildModuleSettingsRoutes({ pipeline, moduleSettings });
};

const routes = buildRoutes();

const call = (method: "GET" | "PUT", as: string, moduleId = "sample", body?: unknown) => {
  const handler = routes[method === "GET" ? "modules.getModuleSettings" : "modules.updateModuleSettings"];
  if (handler === undefined) throw new Error("route missing");
  const init: RequestInit = { method, headers: { authorization: `Bearer ${as}`, "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return handler(new Request(`http://localhost/v1/organizations/org-a/module-settings/${moduleId}`, init));
};

type Body = { data?: Record<string, unknown>; error?: { code: string; details?: { field: string; issue: string }[] } };
const read = async (response: Response) => (await response.json()) as Body;

beforeEach(async () => {
  await Promise.all([MODULE_SETTINGS_COLLECTION, AUDIT_LOG_COLLECTIONS.tenant].map((name) => firestore.recursiveDelete(firestore.collection(name))));
});

describe("module settings routes (emulator)", () => {
  it("answers 404 for a module that declares no settings", async () => {
    const response = await call("GET", "owner", "missing");
    expect(response.status).toBe(404);
    expect((await read(response)).error?.code).toBe("NOT_FOUND");
  });

  it("answers 400 with field details for values that fail the module contract", async () => {
    const response = await call("PUT", "owner", "sample", { greeting: "", defaultBudget: { amountMinor: 10, currency: "brl" } });
    expect(response.status).toBe(400);
    const { error } = await read(response);
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details?.map((detail) => detail.field)).toEqual(expect.arrayContaining(["greeting", "defaultBudget.currency"]));
  });

  it("answers 403 to a member without the update permission and 404 to a non-member", async () => {
    expect((await call("PUT", "viewer", "sample", validValues)).status).toBe(403);
    expect((await call("GET", "stranger")).status).toBe(404);
  });

  it("round-trips PUT then GET and writes one audit entry with field names only", async () => {
    expect(await read(await call("GET", "viewer"))).toMatchObject({ data: { values: null, updatedAt: null } });
    const put = await call("PUT", "owner", "sample", validValues);
    expect(put.status).toBe(200);
    const expected = { tenantId: "org-a", moduleId: "sample", values: validValues, updatedAt: NOW, updatedBy: "owner-1" };
    expect((await read(put)).data).toEqual(expected);
    expect((await read(await call("GET", "viewer"))).data).toEqual(expected);

    const stored = (await firestore.collection(MODULE_SETTINGS_COLLECTION).doc("org-a_sample").get()).data();
    expect(stored).toMatchObject({ tenantId: "org-a", moduleId: "sample", schemaVersion: 1, createdBy: "owner-1" });
    const entries = (await firestore.collection(AUDIT_LOG_COLLECTIONS.tenant).get()).docs.map((doc) => doc.data());
    expect(entries).toEqual([
      expect.objectContaining({ action: "MODULE_SETTINGS_UPDATED", tenantId: "org-a", target: { type: "module-settings", id: "sample" }, changes: ["defaultBudget", "greeting"] }),
    ]);
    expect(JSON.stringify(entries)).not.toContain("Olá");
  });
});
