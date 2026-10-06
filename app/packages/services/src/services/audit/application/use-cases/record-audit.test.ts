import { describe, expect, it } from "vitest";
import { fixedClock } from "#/services/shared/clock/clock.ts";
import { createInMemoryAuditLogWriter } from "../../adapters/driven/in-memory-audit-log-writer.ts";
import { AuditEntryRejectedError } from "../../domain/audit-entry-rejected-error.ts";
import { type AuditRecordInput, makeRecordAudit } from "./record-audit.ts";

const NOW = "2026-09-29T12:00:00.000Z";

const tenantEntry = (overrides: Record<string, unknown> = {}): AuditRecordInput =>
  ({
    log: "tenant",
    tenantId: "org-a",
    action: "ORGANIZATION_UPDATED",
    actor: { type: "user", id: "user-1" },
    target: { type: "organization", id: "org-a" },
    node: { level: "organization", tenantId: "org-a" },
    outcome: "success",
    requestId: "01K6B0000000000000000000RQ",
    changes: ["name"],
    ...overrides,
  }) as AuditRecordInput;

const setup = () => {
  const writer = createInMemoryAuditLogWriter();
  return { writer, audit: makeRecordAudit({ writer, clock: fixedClock(NOW) }) };
};

const rejectionOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return undefined;
  } catch (error: unknown) {
    return error instanceof AuditEntryRejectedError ? { code: error.code, paths: error.issuePaths } : error;
  }
};

describe("AuditWriter.record", () => {
  it("writes a tenant entry stamped with the clock and returns its id", async () => {
    const { writer, audit } = setup();
    const id = await audit.record(tenantEntry());
    expect(writer.entries("tenant")).toEqual([
      {
        id,
        tenantId: "org-a",
        occurredAt: NOW,
        action: "ORGANIZATION_UPDATED",
        actor: { type: "user", id: "user-1" },
        target: { type: "organization", id: "org-a" },
        node: { level: "organization", tenantId: "org-a" },
        outcome: "success",
        requestId: "01K6B0000000000000000000RQ",
        changes: ["name"],
      },
    ]);
    expect(writer.entries("platform")).toEqual([]);
  });

  it("writes a platform entry to the platform log", async () => {
    const { writer, audit } = setup();
    await audit.record({
      log: "platform",
      targetTenantId: "org-a",
      action: "IMPERSONATION_STARTED",
      actor: { type: "user", id: "staff-1" },
      target: { type: "user", id: "user-1" },
      outcome: "success",
      requestId: "req-1",
      reason: "Ticket 1",
    } as AuditRecordInput);
    expect(writer.entries("platform")).toMatchObject([
      { action: "IMPERSONATION_STARTED", targetTenantId: "org-a", occurredAt: NOW },
    ]);
    expect(writer.entries("tenant")).toEqual([]);
  });

  it("passes the business transaction through to the writer", async () => {
    const { writer, audit } = setup();
    const transaction = { marker: "tx" } as unknown as Parameters<typeof audit.record>[1];
    await audit.record(tenantEntry(), transaction);
    expect(writer.transactions()).toEqual([transaction]);
  });

  it("strips unknown keys that carry no personal data", async () => {
    const { writer, audit } = setup();
    await audit.record(tenantEntry({ extra: "x", target: { type: "organization", id: "org-a", label: "Acme" } }));
    const [entry] = writer.entries("tenant");
    expect(entry).not.toHaveProperty("extra");
    expect(entry?.target).toEqual({ type: "organization", id: "org-a" });
  });

  it("rejects an email, token, secret or password key at any depth, without writing", async () => {
    const { writer, audit } = setup();
    expect(await rejectionOf(audit.record(tenantEntry({ email: "a@b.c" })))).toEqual({
      code: "AUDIT_ENTRY_REJECTED",
      paths: ["email"],
    });
    const nested = tenantEntry({
      actor: { type: "user", id: "u", userEmail: "a@b.c" },
      target: { type: "api-key", id: "k", secret: "s" },
    });
    expect(await rejectionOf(audit.record(nested))).toEqual({
      code: "AUDIT_ENTRY_REJECTED",
      paths: ["actor.userEmail", "target.secret"],
    });
    expect(await rejectionOf(audit.record(tenantEntry({ idToken: "t", password: "p" })))).toMatchObject({
      paths: ["idToken", "password"],
    });
    expect(writer.entries("tenant")).toEqual([]);
  });

  it("writes allowlisted metadata and the failed / pending-approval outcomes", async () => {
    const { writer, audit } = setup();
    await audit.record(
      tenantEntry({
        action: "AGENT_TOOL_EXECUTED",
        outcome: "failed",
        metadata: { toolId: "core.search", errorCode: "TOOL_TIMEOUT", durationMs: 30_000 },
      }),
    );
    await audit.record(
      tenantEntry({
        action: "AGENT_TOOL_EXECUTED",
        outcome: "pending-approval",
        metadata: { inputHash: "b".repeat(64) },
      }),
    );
    expect(writer.entries("tenant").map((entry) => [entry.outcome, entry.metadata])).toEqual([
      ["failed", { toolId: "core.search", errorCode: "TOOL_TIMEOUT", durationMs: 30_000 }],
      ["pending-approval", { inputHash: "b".repeat(64) }],
    ]);
  });

  it("rejects metadata outside the allowlist, and personal keys inside it, without writing", async () => {
    const { writer, audit } = setup();
    expect(await rejectionOf(audit.record(tenantEntry({ metadata: { prompt: "x" } })))).toEqual({
      code: "AUDIT_ENTRY_INVALID",
      paths: ["metadata"],
    });
    expect(await rejectionOf(audit.record(tenantEntry({ metadata: { userEmail: "a@b.c" } })))).toEqual({
      code: "AUDIT_ENTRY_REJECTED",
      paths: ["metadata.userEmail"],
    });
    expect(writer.entries("tenant")).toEqual([]);
  });

  it("rejects an entry the contract refuses, naming paths only", async () => {
    const { audit } = setup();
    const rejection = await rejectionOf(
      audit.record(tenantEntry({ action: "SOMETHING_ELSE", changes: ["has space"] })),
    );
    expect(rejection).toEqual({ code: "AUDIT_ENTRY_INVALID", paths: ["action", "changes.0"] });
  });
});
