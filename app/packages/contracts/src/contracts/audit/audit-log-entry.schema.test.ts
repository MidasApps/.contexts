import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AUDIT_ACTIONS } from "./audit-action.schema.ts";
import {
  AuditLogEntryContract,
  AuditLogEntrySchema,
  PlatformAuditLogEntryContract,
  PlatformAuditLogEntrySchema,
} from "./audit-log-entry.schema.ts";
import { AuditLogQuerySchema } from "./audit-log-query.schema.ts";

const [entry] = AuditLogEntryContract.meta.examples as [Record<string, unknown>];

const propertyNames = (schema: z.ZodType): string[] => {
  const names: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      const children: unknown = value;
      if (key === "properties" && typeof children === "object" && children !== null)
        names.push(...Object.keys(children));
      walk(value);
    }
  };
  walk(z.toJSONSchema(schema, { io: "input" }));
  return names;
};

describe("AuditLogEntrySchema", () => {
  it("parses its catalog examples (tenant and platform)", () => {
    for (const contract of [AuditLogEntryContract, PlatformAuditLogEntryContract]) {
      for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
    }
  });

  it("has no email field at any level (entries never carry emails)", () => {
    for (const schema of [AuditLogEntrySchema, PlatformAuditLogEntrySchema]) {
      expect(propertyNames(schema).filter((name) => /email/i.test(name))).toEqual([]);
    }
  });

  it("lists changed field names only: changes is string[]", () => {
    expect(AuditLogEntrySchema.safeParse({ ...entry, changes: ["name", "defaults.timeZone"] }).success).toBe(true);
    expect(AuditLogEntrySchema.safeParse({ ...entry, changes: [{ field: "name", from: "A", to: "B" }] }).success).toBe(
      false,
    );
    expect(AuditLogEntrySchema.safeParse({ ...entry, changes: ["name = Ana"] }).success).toBe(false);
  });

  it("accepts only registered SCREAMING_SNAKE past-tense actions", () => {
    for (const action of AUDIT_ACTIONS) expect(action).toMatch(/^[A-Z]+(?:_[A-Z]+)*$/);
    expect(AuditLogEntrySchema.safeParse({ ...entry, action: "ORGANIZATION_CREATE" }).success).toBe(false);
  });

  it("accepts the agent runtime actions SP3 audits (tool runs, semantic queries, indexed documents)", () => {
    for (const action of ["AGENT_TOOL_EXECUTED", "SEMANTIC_QUERY_EXECUTED", "KNOWLEDGE_DOCUMENT_INDEXED"]) {
      expect(AuditLogEntrySchema.safeParse({ ...entry, action }).success).toBe(true);
    }
  });

  it("accepts the knowledge and file actions SP3 audits (ingested, deleted, uploaded, rejected)", () => {
    for (const action of [
      "KNOWLEDGE_DOCUMENT_INGESTED",
      "KNOWLEDGE_DOCUMENT_DELETED",
      "FILE_UPLOADED",
      "FILE_REJECTED",
    ]) {
      expect(AuditLogEntrySchema.safeParse({ ...entry, action }).success).toBe(true);
    }
  });

  it("records every outcome the agent runtime needs (success, denied, failed, pending-approval)", () => {
    for (const outcome of ["success", "denied", "failed", "pending-approval"]) {
      expect(AuditLogEntrySchema.safeParse({ ...entry, outcome }).success).toBe(true);
    }
    expect(AuditLogEntrySchema.safeParse({ ...entry, outcome: "maybe" }).success).toBe(false);
  });

  it("accepts metadata with allowlisted keys and safe values only", () => {
    const metadata = {
      inputHash: "a".repeat(64),
      errorCode: "TOOL_TIMEOUT",
      fingerprint: "0f".repeat(16),
      toolId: "core.search",
      runId: "run_01K6B0",
      durationMs: 1250,
    };
    expect(AuditLogEntrySchema.parse({ ...entry, metadata }).metadata).toEqual(metadata);
    expect(AuditLogEntrySchema.safeParse({ ...entry, metadata: { prompt: "summarize the contract" } }).success).toBe(
      false,
    );
    expect(AuditLogEntrySchema.safeParse({ ...entry, metadata: { inputHash: "not a hash" } }).success).toBe(false);
    expect(AuditLogEntrySchema.safeParse({ ...entry, metadata: { errorCode: "free text error" } }).success).toBe(false);
    expect(AuditLogEntrySchema.safeParse({ ...entry, metadata: { durationMs: -1 } }).success).toBe(false);
    expect(
      AuditLogEntrySchema.parse({ ...entry, metadata: { endpointId: "tenancy.getOrganization" } }).metadata,
    ).toEqual({ endpointId: "tenancy.getOrganization" });
    expect(AuditLogEntrySchema.safeParse({ ...entry, metadata: { endpointId: "/v1/organizations/x" } }).success).toBe(
      false,
    );
  });

  it("requires tenantId on tenant entries; platform entries carry targetTenantId instead", () => {
    expect(AuditLogEntrySchema.safeParse({ ...entry, tenantId: undefined }).success).toBe(false);
    expect(Object.keys(PlatformAuditLogEntrySchema.shape)).not.toContain("tenantId");
    expect(Object.keys(PlatformAuditLogEntrySchema.shape)).toContain("targetTenantId");
  });
});

describe("AuditLogQuerySchema", () => {
  it("adds filters on top of the page query", () => {
    expect(AuditLogQuerySchema.parse({ action: "ROLE_CREATED", limit: "50" })).toEqual({
      action: "ROLE_CREATED",
      limit: 50,
    });
  });

  it("rejects an inverted time window", () => {
    expect(
      AuditLogQuerySchema.safeParse({
        occurredAfter: "2026-09-30T00:00:00.000Z",
        occurredBefore: "2026-09-29T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
