import { describe, expect, it } from "vitest";
import { buildAgentContextEntries, TEST_TENANT } from "../testing/agent-context-fixture.ts";
import { AGENT_PRINCIPAL_KEY, nodeOfContext, readAgentContext } from "./agent-request-context.ts";

describe("readAgentContext", () => {
  it("reads a complete context and the verified principal", () => {
    const result = readAgentContext(new Map(buildAgentContextEntries()));
    expect(result).toMatchObject({
      ok: true,
      data: { context: { tenantId: TEST_TENANT }, principal: { type: "user" } },
    });
  });

  it("reports missing keys instead of defaulting a tenant", () => {
    const entries = buildAgentContextEntries().filter(([key]) => key !== "tenantId" && key !== "organizationId");
    const result = readAgentContext(new Map(entries));
    expect(result).toEqual({ ok: false, missing: ["tenantId", "organizationId"] });
  });

  it("fails without a request context or principal", () => {
    expect(readAgentContext(undefined).ok).toBe(false);
    const entries = buildAgentContextEntries().filter(([key]) => key !== AGENT_PRINCIPAL_KEY);
    expect(readAgentContext(new Map(entries))).toEqual({ ok: false, missing: [AGENT_PRINCIPAL_KEY] });
  });

  it("rejects a principal that is not the caller named by the context", () => {
    const entries = buildAgentContextEntries({ principal: { type: "user", uid: "someone-else", mfa: false } });
    expect(readAgentContext(new Map(entries))).toEqual({ ok: false, missing: [AGENT_PRINCIPAL_KEY] });
  });

  it("rejects an API key principal of another tenant", () => {
    const entries = buildAgentContextEntries({
      principalKind: "service",
      principal: { type: "service", apiKeyId: "key-1", tenantId: "OtherTenant000000000", ownerUid: "member-uid" },
    });
    expect(readAgentContext(new Map(entries)).ok).toBe(false);
  });
});

describe("nodeOfContext", () => {
  it("scopes to the deepest node the context names", () => {
    const read = (overrides: Parameters<typeof buildAgentContextEntries>[0]) => {
      const result = readAgentContext(new Map(buildAgentContextEntries(overrides)));
      if (!result.ok) throw new Error("expected a context");
      return nodeOfContext(result.data.context);
    };
    expect(read({})).toEqual({ level: "organization", tenantId: TEST_TENANT });
    expect(read({ projectId: "project-1" })).toEqual({
      level: "project",
      tenantId: TEST_TENANT,
      projectId: "project-1",
    });
    expect(read({ projectId: "project-1", unitId: "unit-1" })).toMatchObject({ level: "unit", unitId: "unit-1" });
  });
});
