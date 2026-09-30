import { describe, expect, expectTypeOf, it } from "vitest";
import type { TenantId } from "../primitives/ids.schema.ts";
import { AGENT_PERMISSIONS } from "./agent-permissions.ts";
import { AgentRequestContextContract, AgentRequestContextSchema, type AgentRequestContext } from "./agent-request-context.schema.ts";
import { AgentSettingsContract, AgentSettingsSchema, type AgentSettings } from "./agent-settings.schema.ts";
import { AgentApprovalRequestContract, AgentApprovalRequestSchema } from "./approval-request.schema.ts";
import { FORWARDED_HEADERS } from "./forwarded-headers.ts";
import { ToolUiContract, ToolUiSchema } from "./tool-ui.schema.ts";

const contracts = [AgentRequestContextContract, AgentSettingsContract, ToolUiContract, AgentApprovalRequestContract];

describe("agent contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses", (_id, contract) => {
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: rejects an unknown key", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });

  it("brands tenant ids", () => {
    expectTypeOf<AgentRequestContext["tenantId"]>().toEqualTypeOf<TenantId>();
    expectTypeOf<AgentSettings["tenantId"]>().toEqualTypeOf<TenantId>();
  });
});

describe("AgentRequestContextSchema", () => {
  const [example] = AgentRequestContextContract.meta.examples as [Record<string, unknown>];

  it("requires organizationId to equal tenantId (TokenCostControl reads it)", () => {
    expect(AgentRequestContextSchema.safeParse({ ...example, organizationId: "other-tenant" }).success).toBe(false);
  });

  it("requires a ULID request id", () => {
    expect(AgentRequestContextSchema.safeParse({ ...example, requestId: "not-a-ulid" }).success).toBe(false);
  });

  it("caps the active screen at 200 chars", () => {
    expect(AgentRequestContextSchema.safeParse({ ...example, activeScreen: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts only real or fake ai mode", () => {
    expect(AgentRequestContextSchema.safeParse({ ...example, aiMode: "mock" }).success).toBe(false);
  });
});

describe("AgentSettingsSchema", () => {
  const [example] = AgentSettingsContract.meta.examples as [Record<string, unknown>];

  it("rejects a negative budget", () => {
    expect(AgentSettingsSchema.safeParse({ ...example, budget: { monthlyMicroUsd: -1, monthlyTokens: 10 } }).success).toBe(false);
  });

  it("accepts only warn or redact for pii", () => {
    expect(AgentSettingsSchema.safeParse({ ...example, guardrails: { pii: "off" } }).success).toBe(false);
  });
});

describe("ToolUiSchema", () => {
  it("requires a kebab-case component id", () => {
    expect(ToolUiSchema.safeParse({ component: "SchemaForm", props: {} }).success).toBe(false);
  });
});

describe("AgentApprovalRequestSchema", () => {
  const [example] = AgentApprovalRequestContract.meta.examples as [Record<string, unknown>];

  it("derives the idempotency key from runId and toolCallId", () => {
    expect(AgentApprovalRequestSchema.safeParse({ ...example, idempotencyKey: "other" }).success).toBe(false);
  });
});

describe("FORWARDED_HEADERS", () => {
  it("uses lowercase header names without duplicates", () => {
    const names = Object.values(FORWARDED_HEADERS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toBe(name.toLowerCase());
  });
});

describe("AGENT_PERMISSIONS", () => {
  it("lists the SP3 permissions once, all tenant-scoped with owner", () => {
    const ids = AGENT_PERMISSIONS.map((permission) => permission.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(["core.chat.use", "core.mcp.use", "core.file.upload", "core.usage.read", "core.catalog.query"]),
    );
    for (const permission of AGENT_PERMISSIONS) {
      expect(permission.scope).toBe("tenant");
      expect(permission.defaultRoles).toContain("owner");
    }
  });

  it("keeps admin-only permissions away from members", () => {
    const connectorWrite = AGENT_PERMISSIONS.find((permission) => permission.id === "core.connector.write");
    expect(connectorWrite).toMatchObject({ kind: "write", defaultRoles: ["owner", "admin"] });
    const chat = AGENT_PERMISSIONS.find((permission) => permission.id === "core.chat.use");
    expect(chat?.defaultRoles).toContain("member");
  });
});
