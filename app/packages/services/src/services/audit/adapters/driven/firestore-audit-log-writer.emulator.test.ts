import { AuditLogEntryContract, PlatformAuditLogEntryContract } from "@core/contracts";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "#/services/shared/clock/clock.ts";
import { createFirebaseAdmin } from "#/services/shared/firebase/firebase-admin.ts";
import { createContractConverter } from "#/services/shared/firestore/contract-converter.ts";
import { runInTransaction } from "#/services/shared/firestore/transaction-runner.ts";
import { type AuditRecordInput, makeRecordAudit } from "../../application/use-cases/record-audit.ts";
import { AuditEntryRejectedError } from "../../domain/audit-entry-rejected-error.ts";
import { AUDIT_LOG_COLLECTIONS, createFirestoreAuditLogWriter } from "./firestore-audit-log-writer.ts";

// Runs inside `firebase emulators:exec`, which exports FIRESTORE_EMULATOR_HOST.
const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});

const NOW = "2026-09-29T12:00:00.000Z";
const BUSINESS = "audit-writer-test-docs";
const audit = makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore }), clock: fixedClock(NOW) });

const entry = (overrides: Record<string, unknown> = {}): AuditRecordInput =>
  ({
    log: "tenant",
    tenantId: "org-a",
    action: "PROJECT_CREATED",
    actor: { type: "user", id: "user-1" },
    target: { type: "project", id: "p1" },
    node: { level: "project", tenantId: "org-a", projectId: "p1" },
    outcome: "success",
    requestId: "req-1",
    ...overrides,
  }) as AuditRecordInput;

const tenantLog = () => firestore.collection(AUDIT_LOG_COLLECTIONS.tenant);
const platformLog = () => firestore.collection(AUDIT_LOG_COLLECTIONS.platform);

beforeEach(async () => {
  await Promise.all(
    [tenantLog(), platformLog(), firestore.collection(BUSINESS)].map((collection) =>
      firestore.recursiveDelete(collection),
    ),
  );
});

describe("Firestore audit log writer", () => {
  it("commits the entry with the business transaction and reads back through the contract", async () => {
    const business = firestore.collection(BUSINESS).doc();
    const id = await runInTransaction(firestore, async (tx) => {
      tx.create(business, { name: "p1" });
      return audit.record(entry(), tx);
    });

    const raw = (await tenantLog().doc(id).get()).data();
    expect(raw?.["occurredAt"]).toBeInstanceOf(Timestamp);
    expect(raw).toMatchObject({ schemaVersion: 1, createdBy: "user-1" });
    const read = (await tenantLog().withConverter(createContractConverter(AuditLogEntryContract)).doc(id).get()).data();
    expect(read).toEqual({
      id,
      occurredAt: NOW,
      ...Object.fromEntries(Object.entries(entry()).filter(([key]) => key !== "log")),
    });
    expect((await business.get()).exists).toBe(true);
  });

  it("stores and reads back the failed outcome with allowlisted metadata", async () => {
    const failed = entry({
      action: "AGENT_TOOL_EXECUTED",
      outcome: "failed",
      metadata: { toolId: "core.search", errorCode: "TOOL_TIMEOUT", durationMs: 1200 },
    });
    const id = await audit.record(failed);
    const read = (await tenantLog().withConverter(createContractConverter(AuditLogEntryContract)).doc(id).get()).data();
    expect(read).toMatchObject({
      outcome: "failed",
      metadata: { toolId: "core.search", errorCode: "TOOL_TIMEOUT", durationMs: 1200 },
    });
  });

  it("drops the entry when the business transaction fails", async () => {
    await expect(
      runInTransaction(firestore, async (tx) => {
        await audit.record(entry(), tx);
        throw new Error("business rule failed");
      }),
    ).rejects.toThrow("business rule failed");
    expect((await tenantLog().get()).size).toBe(0);
  });

  it("writes platform entries to the platform log", async () => {
    const id = await audit.record({
      log: "platform",
      targetTenantId: "org-a",
      action: "IMPERSONATION_STARTED",
      actor: { type: "user", id: "staff-1" },
      target: { type: "user", id: "user-1" },
      outcome: "success",
      requestId: "req-2",
      reason: "Ticket 1",
    } as AuditRecordInput);
    const read = (
      await platformLog().withConverter(createContractConverter(PlatformAuditLogEntryContract)).doc(id).get()
    ).data();
    expect(read).toMatchObject({ action: "IMPERSONATION_STARTED", targetTenantId: "org-a", occurredAt: NOW });
    expect((await tenantLog().get()).size).toBe(0);
  });

  it("rejects an entry with an email key and writes nothing", async () => {
    await expect(audit.record(entry({ actor: { type: "user", id: "user-1", email: "a@b.c" } }))).rejects.toBeInstanceOf(
      AuditEntryRejectedError,
    );
    expect((await tenantLog().get()).size).toBe(0);
  });
});
