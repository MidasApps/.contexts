import { createInMemoryAuditLogWriter, fixedClock, makeRecordAudit } from "@core/services";
import { describe, expect, it } from "vitest";
import { AGENT_TOOL_TARGET_TYPE, auditMetadataOf, bindAuditPort } from "./audit-port-binding.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
const DIGEST = "ab".repeat(32);

const setup = () => {
  const log = createInMemoryAuditLogWriter();
  const port = bindAuditPort(makeRecordAudit({ writer: log, clock: fixedClock("2026-09-30T12:00:00.000Z") }));
  return { log, port };
};

const toolEntry = {
  action: "AGENT_TOOL_EXECUTED",
  tenantId: TENANT,
  actor: { type: "user", uid: "member-uid", mfa: false },
  metadata: { toolId: "catalog.listEntities", inputHash: `sha256:${DIGEST}`, outcome: "succeeded", agentId: "ping", permission: "core.catalog.read", runId: REQUEST_ID },
  requestId: REQUEST_ID,
} as const;

describe("bindAuditPort", () => {
  it("writes an SP1 tenant entry with the tool as target and the allowlisted metadata only", async () => {
    const { log, port } = setup();
    await port.record(toolEntry);
    const [entry] = log.entries("tenant");
    expect(entry).toMatchObject({
      tenantId: TENANT,
      action: "AGENT_TOOL_EXECUTED",
      actor: { type: "user", id: "member-uid" },
      target: { type: AGENT_TOOL_TARGET_TYPE, id: "catalog.listEntities" },
      outcome: "success",
      metadata: { toolId: "catalog.listEntities", inputHash: DIGEST, runId: REQUEST_ID },
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(entry)).not.toContain("core.catalog.read");
    expect(JSON.stringify(entry)).not.toContain('"agentId"');
  });

  it("maps every pipeline outcome to SP1's outcome, an unknown one to failed", async () => {
    const { log, port } = setup();
    for (const outcome of ["denied", "failed", "pending-approval", "something-new"]) {
      await port.record({ ...toolEntry, metadata: { ...toolEntry.metadata, outcome, errorCode: "TOOL_TIMEOUT" } });
    }
    expect(log.entries("tenant").map((entry) => entry.outcome)).toEqual(["denied", "failed", "pending-approval", "failed"]);
    expect(log.entries("tenant")[1]?.metadata).toMatchObject({ errorCode: "TOOL_TIMEOUT" });
  });

  it("maps API keys and impersonated users", async () => {
    const { log, port } = setup();
    await port.record({ ...toolEntry, actor: { type: "service", apiKeyId: "key-1", tenantId: TENANT, ownerUid: "member-uid" }, metadata: { ...toolEntry.metadata, outcome: "denied" } });
    await port.record({ ...toolEntry, actor: { type: "user", uid: "member-uid", mfa: false, impersonation: { sessionId: "s1", staffUid: "staff-uid" } } });
    const [key, impersonated] = log.entries("tenant");
    expect(key).toMatchObject({ actor: { type: "service", id: "key-1" }, outcome: "denied" });
    expect(impersonated).toMatchObject({ actor: { type: "user", id: "member-uid", onBehalfOf: "staff-uid" } });
  });

  it("rejects an unregistered action or a missing request id (the tool answers AUDIT_UNAVAILABLE)", async () => {
    const { log, port } = setup();
    await expect(port.record({ ...toolEntry, action: "SOMETHING_UNLISTED" })).rejects.toThrow();
    const withoutRequestId = { action: toolEntry.action, tenantId: TENANT, actor: toolEntry.actor, metadata: toolEntry.metadata };
    await expect(port.record(withoutRequestId)).rejects.toThrow(/AUDIT_REQUEST_ID_MISSING/);
    expect(log.entries("tenant")).toEqual([]);
  });
});

describe("auditMetadataOf", () => {
  it("drops values SP1 would refuse instead of failing the audit, and free-text keys entirely", () => {
    expect(auditMetadataOf({ inputHash: "sha256:not-hex", errorCode: "free text", reason: "NOT_A_MEMBER", approvalId: "a1", rowCount: "3" })).toBeUndefined();
    expect(auditMetadataOf({ fingerprint: "0f1e2d3c4b5a6978", errorCode: "SQL_REJECTED" })).toEqual({ fingerprint: "0f1e2d3c4b5a6978", errorCode: "SQL_REJECTED" });
  });
});
