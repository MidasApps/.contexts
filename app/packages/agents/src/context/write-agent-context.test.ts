import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import type { AgentPrincipal } from "../auth/agent-principal.ts";
import { FAKE_REGIONAL } from "../testing/fake-ports.ts";
import { TEST_REQUEST_ID, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { AGENT_CONTEXT_KEYS, AGENT_PRINCIPAL_KEY, readAgentContext } from "./agent-request-context.ts";
import { AgentRuntimeContextSchema, buildAgentRequestContext, clearAgentContext, writeAgentContext } from "./write-agent-context.ts";

const CONVERSATION = "Cv3sK2lPq0WnR5tYu3bV";

const member = (overrides: Partial<AgentPrincipal> = {}): AgentPrincipal => ({
  kind: "user",
  uid: TEST_UID,
  principal: { type: "user", uid: TEST_UID, mfa: false },
  tenantId: TEST_TENANT,
  isMember: true,
  permissions: new Set(["core.chat.use", "core.catalog.read"]),
  regional: FAKE_REGIONAL,
  ...overrides,
});

/** A member scoped to a project, on a screen. */
const scoped = (): AgentPrincipal => member({ projectId: "Pq8sK2lPq0WnR5tYu3bV", activeScreen: "notes.list" });

const build = (principal: AgentPrincipal, conversationId?: string) =>
  buildAgentRequestContext({ principal, requestId: TEST_REQUEST_ID, aiMode: "fake", ...(conversationId === undefined ? {} : { conversationId }) });

describe("buildAgentRequestContext", () => {
  it("builds every key from the verified principal (organizationId = tenantId, sorted permissions)", () => {
    expect(build(scoped(), CONVERSATION)).toEqual({
      tenantId: TEST_TENANT,
      projectId: "Pq8sK2lPq0WnR5tYu3bV",
      userId: TEST_UID,
      principalKind: "user",
      permissions: ["core.catalog.read", "core.chat.use"],
      ...FAKE_REGIONAL,
      activeScreen: "notes.list",
      requestId: TEST_REQUEST_ID,
      conversationId: CONVERSATION,
      organizationId: TEST_TENANT,
      aiMode: "fake",
    });
  });

  it("returns null without membership, tenant or regional settings (fail-closed)", () => {
    expect(build(member({ isMember: false }))).toBeNull();
    expect(build(member({ tenantId: null }))).toBeNull();
    expect(build(member({ regional: null }))).toBeNull();
  });

  it("drops a malformed conversation id instead of trusting it", () => {
    expect(build(member(), "../other-thread")?.conversationId).toBeUndefined();
  });
});

describe("writeAgentContext", () => {
  it("overwrites client-sent keys and sets the resource and thread keys", () => {
    const store = new RequestContext<unknown>([
      ["tenantId", "ClientTenant00000000"],
      ["permissions", ["platform.everything"]],
      [AGENT_PRINCIPAL_KEY, { type: "user", uid: "intruder", mfa: true }],
      [MASTRA_RESOURCE_ID_KEY, "ClientTenant00000000:intruder"],
    ]);
    const principal = scoped();
    const context = build(principal, CONVERSATION);
    if (context === null) throw new Error("expected a context");
    writeAgentContext(store, { context, principal: principal.principal });
    expect(store.get("tenantId")).toBe(TEST_TENANT);
    expect(store.get("permissions")).toEqual(["core.catalog.read", "core.chat.use"]);
    expect(store.get(MASTRA_RESOURCE_ID_KEY)).toBe(`${TEST_TENANT}:${TEST_UID}`);
    expect(store.get(MASTRA_THREAD_ID_KEY)).toBe(CONVERSATION);
    expect(readAgentContext(store)).toMatchObject({ ok: true, data: { principal: { uid: TEST_UID } } });
  });

  it("removes optional keys a client sent when the principal has none", () => {
    const store = new RequestContext<unknown>([
      ["unitId", "ClientUnit0000000000"],
      ["conversationId", "ClientThread00000000"],
      [MASTRA_THREAD_ID_KEY, "ClientThread00000000"],
    ]);
    const principal = member();
    const context = build(principal);
    if (context === null) throw new Error("expected a context");
    writeAgentContext(store, { context, principal: principal.principal });
    for (const key of ["projectId", "unitId", "conversationId", "activeScreen", MASTRA_THREAD_ID_KEY]) expect(store.has(key)).toBe(false);
  });
});

describe("clearAgentContext", () => {
  it("removes every agent key, the principal and the resource/thread keys", () => {
    const store = new RequestContext<unknown>([
      ...AGENT_CONTEXT_KEYS.map((key) => [key, "client"] as [string, unknown]),
      [AGENT_PRINCIPAL_KEY, "client"],
      [MASTRA_RESOURCE_ID_KEY, "client"],
      [MASTRA_THREAD_ID_KEY, "client"],
      ["unrelated", "kept"],
    ]);
    clearAgentContext(store);
    expect([...store.keys()]).toEqual(["unrelated"]);
  });
});

describe("AgentRuntimeContextSchema", () => {
  it("accepts the written context next to Mastra's own keys and requires the principal", () => {
    const principal = member();
    const context = build(principal);
    if (context === null) throw new Error("expected a context");
    const values = { ...context, [AGENT_PRINCIPAL_KEY]: principal.principal, user: principal, [MASTRA_RESOURCE_ID_KEY]: "x" };
    expect(AgentRuntimeContextSchema.safeParse(values).success).toBe(true);
    expect(AgentRuntimeContextSchema.safeParse({ ...context }).success).toBe(false);
    expect(AgentRuntimeContextSchema.safeParse({ ...values, organizationId: "Other000000000000000" }).success).toBe(false);
  });
});
