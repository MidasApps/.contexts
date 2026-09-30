import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { AGENT_PRINCIPAL_KEY, readAgentContext } from "../context/agent-request-context.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";
import { createFakeAccessPort } from "../testing/fake-ports.ts";
import { createContextMiddleware } from "./context-middleware.ts";
import { FirebaseMastraAuth } from "./firebase-mastra-auth.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
const MEMBER: AccessPrincipal = { type: "user", uid: "member-uid", mfa: false };

const setup = () => {
  const access = createFakeAccessPort({
    credentials: { "member-token": MEMBER, "outsider-token": { type: "user", uid: "outsider", mfa: false } },
    memberships: [{ tenantId: TENANT, uid: "member-uid", permissions: ["core.chat.use", "core.catalog.read"] }],
  });
  return { access, middleware: createContextMiddleware({ auth: new FirebaseMastraAuth({ access }), aiMode: "fake" }) };
};

const run = async (headers: Record<string, string>, seed: [string, unknown][] = []) => {
  const { access, middleware } = setup();
  const store = new RequestContext<unknown>(seed);
  const raw = new Request("http://mastra.internal/api/agents/ping/generate", { method: "POST", headers });
  let nextCalled = false;
  const response = await middleware.handler({ req: { raw }, get: () => store }, () => {
    nextCalled = true;
    return Promise.resolve();
  });
  return { store, nextCalled, response, access };
};

const memberHeaders = { authorization: "Bearer member-token", "x-tenant-id": TENANT, "x-request-id": REQUEST_ID };

describe("createContextMiddleware", () => {
  it("is mounted on the API prefix", () => {
    expect(setup().middleware.path).toBe("/api/*");
  });

  it("writes the typed context of a member and overwrites a client-sent tenant", async () => {
    const { store, nextCalled } = await run(memberHeaders, [
      ["tenantId", "ClientTenant00000000"],
      ["organizationId", "ClientTenant00000000"],
      ["permissions", ["platform.everything"]],
    ]);
    expect(nextCalled).toBe(true);
    const read = readAgentContext(store);
    expect(read).toMatchObject({ ok: true, data: { context: { tenantId: TENANT, organizationId: TENANT, requestId: REQUEST_ID, aiMode: "fake" } } });
    expect(store.get("permissions")).toEqual(["core.catalog.read", "core.chat.use"]);
    expect(store.get(MASTRA_RESOURCE_ID_KEY)).toBe(`${TENANT}:member-uid`);
  });

  it("binds the memory thread to a forwarded conversation id", async () => {
    const { store } = await run({ ...memberHeaders, "x-conversation-id": "Cv3sK2lPq0WnR5tYu3bV" });
    expect(store.get("conversationId")).toBe("Cv3sK2lPq0WnR5tYu3bV");
    expect(store.get(MASTRA_THREAD_ID_KEY)).toBe("Cv3sK2lPq0WnR5tYu3bV");
  });

  it("replaces a malformed request id with a fresh ULID", async () => {
    const { store } = await run({ ...memberHeaders, "x-request-id": "not a ulid" });
    expect(store.get("requestId")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("leaves the 401 path to Mastra's auth: no principal, no keys, no response", async () => {
    const seed: [string, unknown][] = [["tenantId", TENANT], [AGENT_PRINCIPAL_KEY, MEMBER], [MASTRA_RESOURCE_ID_KEY, "x"]];
    for (const headers of [{ "x-tenant-id": TENANT }, { authorization: "Bearer garbage", "x-tenant-id": TENANT }]) {
      const { store, nextCalled, response } = await run(headers, seed);
      expect(nextCalled).toBe(true);
      expect(response).toBeUndefined();
      expect([...store.keys()]).toEqual([]);
    }
  });

  it("writes nothing for a non-member (Mastra answers 403)", async () => {
    const { store, nextCalled } = await run({ authorization: "Bearer outsider-token", "x-tenant-id": TENANT });
    expect(nextCalled).toBe(true);
    expect(readAgentContext(store).ok).toBe(false);
  });

  it("treats a failing access port like a missing principal (fail-closed)", async () => {
    const access = createFakeAccessPort({ credentials: { "member-token": MEMBER } });
    const failing = { ...access, resolveAccessContext: () => Promise.reject(new Error("readers down")) };
    const middleware = createContextMiddleware({ auth: new FirebaseMastraAuth({ access: failing }), aiMode: "fake" });
    const store = new RequestContext<unknown>();
    const raw = new Request("http://mastra.internal/api/agents/ping/generate", { method: "POST", headers: memberHeaders });
    await middleware.handler({ req: { raw }, get: () => store }, () => Promise.resolve());
    expect([...store.keys()]).toEqual([]);
  });

  it("verifies the credential once for the middleware and the route auth", async () => {
    const { access, middleware } = setup();
    const auth = new FirebaseMastraAuth({ access });
    const shared = createContextMiddleware({ auth, aiMode: "fake" });
    const raw = new Request("http://mastra.internal/api/agents/ping/generate", { method: "POST", headers: memberHeaders });
    await shared.handler({ req: { raw }, get: () => new RequestContext<unknown>() }, () => Promise.resolve());
    await auth.authenticateToken("member-token", raw);
    expect(access.verifyCalls).toHaveLength(1);
    expect(middleware.path).toBe("/api/*");
  });
  it("replaces client tracing options with the forwarded traceparent before authenticating", async () => {
    const { middleware } = setup();
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const raw = new Request("http://mastra.internal/api/agents/ping/stream", {
      method: "POST",
      headers: { ...memberHeaders, traceparent, "content-type": "application/json" },
      body: JSON.stringify({ messages: ["hi"], tracingOptions: { metadata: { tenantId: "Intruder000000000000" } } }),
    });
    const context = { req: { raw }, get: () => new RequestContext<unknown>() };
    await middleware.handler(context, () => Promise.resolve());
    expect(context.req.raw).not.toBe(raw);
    expect(await context.req.raw.json()).toEqual({
      messages: ["hi"],
      tracingOptions: { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", parentSpanId: "00f067aa0ba902b7" },
    });
    expect(context.req.raw.headers.get("authorization")).toBe("Bearer member-token");
  });
});
