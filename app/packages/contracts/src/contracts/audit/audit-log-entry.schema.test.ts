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
      if (key === "properties" && typeof children === "object" && children !== null) names.push(...Object.keys(children));
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
    expect(AuditLogEntrySchema.safeParse({ ...entry, changes: [{ field: "name", from: "A", to: "B" }] }).success).toBe(false);
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

  it("requires tenantId on tenant entries; platform entries carry targetTenantId instead", () => {
    expect(AuditLogEntrySchema.safeParse({ ...entry, tenantId: undefined }).success).toBe(false);
    expect(Object.keys(PlatformAuditLogEntrySchema.shape)).not.toContain("tenantId");
    expect(Object.keys(PlatformAuditLogEntrySchema.shape)).toContain("targetTenantId");
  });
});

describe("AuditLogQuerySchema", () => {
  it("adds filters on top of the page query", () => {
    expect(AuditLogQuerySchema.parse({ action: "ROLE_CREATED", limit: "50" })).toEqual({ action: "ROLE_CREATED", limit: 50 });
  });

  it("rejects an inverted time window", () => {
    expect(
      AuditLogQuerySchema.safeParse({ occurredAfter: "2026-09-30T00:00:00.000Z", occurredBefore: "2026-09-29T00:00:00.000Z" }).success,
    ).toBe(false);
  });
});
