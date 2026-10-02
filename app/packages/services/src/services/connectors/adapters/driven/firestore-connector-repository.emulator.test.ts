import { type Connector, ConnectorSchema, TenantIdSchema } from "@core/contracts";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirebaseAdmin } from "../../../shared/firebase/firebase-admin.ts";
import { createFirestoreUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import { CONNECTORS_COLLECTION, createFirestoreConnectorRepository } from "./firestore-connector-repository.ts";
import { createLocalSecretStore, LOCAL_SECRETS_COLLECTION } from "./local-secret-store.ts";

const { firestore } = createFirebaseAdmin({ env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" }, processEnv: process.env });
const repository = createFirestoreConnectorRepository({ firestore });
const unitOfWork = createFirestoreUnitOfWork({ firestore });
// Tenants unique to this file: other suites share the emulator.
const TENANT = TenantIdSchema.parse("ConnRepoTenant000001");
const OTHER = TenantIdSchema.parse("ConnRepoTenant000002");

const connectorOf = (tenantId: string, createdAt: string, status: Connector["status"] = "active"): Connector =>
  ConnectorSchema.parse({
    id: repository.newId(),
    tenantId,
    name: "docs-mcp",
    type: "mcp",
    status,
    secretRef: null,
    toolPolicy: { allow: ["search"], readOnly: ["search"] },
    config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
    createdBy: "alice",
    createdAt,
    updatedAt: createdAt,
  });

const clear = async () => {
  for (const tenantId of [TENANT, OTHER]) {
    const docs = await firestore.collection(CONNECTORS_COLLECTION).where("tenantId", "==", tenantId).get();
    await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
  }
};

beforeAll(clear);
afterAll(clear);

describe("firestore connector repository (emulator)", () => {
  it("stores connectors with timestamps and schemaVersion, reads them back per tenant, newest first", async () => {
    const older = connectorOf(TENANT, "2026-09-30T10:00:00.000Z");
    const newer = connectorOf(TENANT, "2026-09-30T11:00:00.000Z", "disabled");
    const foreign = connectorOf(OTHER, "2026-09-30T12:00:00.000Z");
    await unitOfWork.run((tx) => Promise.resolve([older, newer, foreign].forEach((connector) => repository.create(tx, { connector }))));
    const stored = (await firestore.collection(CONNECTORS_COLLECTION).doc(older.id).get()).data();
    expect(stored?.schemaVersion).toBe(1);
    expect(stored?.createdAt).toBeInstanceOf(Timestamp);
    expect((stored?.createdAt as Timestamp).toDate().toISOString()).toBe(older.createdAt);
    expect(await repository.get(undefined, { tenantId: TENANT, connectorId: older.id })).toEqual(older);
    expect(await repository.get(undefined, { tenantId: OTHER, connectorId: older.id })).toBeNull();
    const page = await repository.list({ tenantId: TENANT, page: { after: undefined, limit: 1 } });
    expect(page.items.map((item) => item.id)).toEqual([newer.id]);
    expect(page.nextCursor).not.toBeNull();
    expect((await repository.listActive({ tenantId: TENANT })).map((item) => item.id)).toEqual([older.id]);
  });

  it("replaces and deletes inside a transaction", async () => {
    const connector = connectorOf(TENANT, "2026-09-30T09:00:00.000Z");
    await unitOfWork.run((tx) => Promise.resolve(repository.create(tx, { connector })));
    await unitOfWork.run((tx) => Promise.resolve(repository.replace(tx, { connector: { ...connector, name: "renamed" }, actorId: "bob" })));
    expect((await repository.get(undefined, { tenantId: TENANT, connectorId: connector.id }))?.name).toBe("renamed");
    await unitOfWork.run((tx) => Promise.resolve(repository.delete(tx, { connectorId: connector.id })));
    expect(await repository.get(undefined, { tenantId: TENANT, connectorId: connector.id })).toBeNull();
  });

  it("records and clears the runtime's load error of its own tenant's connector only", async () => {
    const connector = connectorOf(TENANT, "2026-09-03T00:00:00.000Z");
    await unitOfWork.run((tx) => Promise.resolve(repository.create(tx, { connector })));
    const lastError = { code: "CONNECT_FAILED" as const, at: "2026-10-01T10:00:00.000Z" };
    await repository.recordLoad({ tenantId: OTHER, connectorId: connector.id, lastError });
    expect((await repository.get(undefined, { tenantId: TENANT, connectorId: connector.id }))?.lastError).toBeUndefined();
    await repository.recordLoad({ tenantId: TENANT, connectorId: connector.id, lastError });
    const stored = await firestore.collection(CONNECTORS_COLLECTION).doc(connector.id).get();
    expect(stored.get("lastError.at")).toBeInstanceOf(Timestamp);
    const failing = await repository.get(undefined, { tenantId: TENANT, connectorId: connector.id });
    if (failing === null) throw new Error("connector missing");
    expect(failing.lastError).toEqual(lastError);
    expect(failing.updatedAt).toBe(connector.updatedAt);
    // An edit keeps the error until the runtime loads the connector again.
    await unitOfWork.run((tx) => Promise.resolve(repository.replace(tx, { connector: { ...failing, name: "docs" }, actorId: "bob" })));
    expect((await repository.get(undefined, { tenantId: TENANT, connectorId: connector.id }))?.lastError).toEqual(lastError);
    await repository.recordLoad({ tenantId: TENANT, connectorId: connector.id, lastError: null });
    expect((await repository.get(undefined, { tenantId: TENANT, connectorId: connector.id }))?.lastError).toBeNull();
    await repository.recordLoad({ tenantId: TENANT, connectorId: repository.newId(), lastError });
  });

  it("keeps local secrets in the emulator collection", async () => {
    const store = createLocalSecretStore({ firestore, appEnv: "local" });
    await store.put("connector-emulator-test", "value-1");
    expect(await store.get("connector-emulator-test")).toBe("value-1");
    await store.delete("connector-emulator-test");
    expect(await store.get("connector-emulator-test")).toBeNull();
    expect((await firestore.collection(LOCAL_SECRETS_COLLECTION).doc("connector-emulator-test").get()).exists).toBe(false);
  });
});
