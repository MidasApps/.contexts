import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { isAgentRunPath } from "../runtime/core-flag-keys.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";
import { createFakeAccessPort } from "../testing/fake-ports.ts";
import { createContextMiddleware, type KillSwitch } from "./context-middleware.ts";
import { FirebaseMastraAuth } from "./firebase-mastra-auth.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
const MEMBER: AccessPrincipal = { type: "user", uid: "member-uid", mfa: false };
const headers = { authorization: "Bearer member-token", "x-tenant-id": TENANT, "x-request-id": REQUEST_ID };

const run = async (path: string, killed: (tenantId: string) => Promise<boolean>, auth: Record<string, string> = headers) => {
  const access = createFakeAccessPort({ credentials: { "member-token": MEMBER }, memberships: [{ tenantId: TENANT, uid: "member-uid", permissions: ["core.chat.use"] }] });
  const asked: string[] = [];
  const killSwitch: KillSwitch = { appliesTo: isAgentRunPath(), isKilled: (tenantId) => (asked.push(tenantId), killed(tenantId)) };
  const middleware = createContextMiddleware({ auth: new FirebaseMastraAuth({ access }), aiMode: "fake", killSwitch, path: "/*" });
  let nextCalled = false;
  const response = await middleware.handler({ req: { raw: new Request(`http://mastra.internal${path}`, { method: "POST", headers: auth }) }, get: () => new RequestContext<unknown>(), header: () => undefined }, () => {
    nextCalled = true;
    return Promise.resolve();
  });
  return { response, nextCalled, asked };
};

describe("AI kill-switch in the context middleware (decision 0039)", () => {
  it("answers 503 FEATURE_DISABLED for agent, chat and voice runs of a killed tenant, before the run", async () => {
    for (const path of ["/api/agents/assistant/stream", "/chat/assistant", "/voice/speech"]) {
      const { response, nextCalled, asked } = await run(path, () => Promise.resolve(true));
      expect(response?.status).toBe(503);
      expect(await response?.json()).toEqual({ error: { code: "FEATURE_DISABLED", message: "This feature is turned off.", requestId: REQUEST_ID } });
      expect(nextCalled).toBe(false);
      expect(asked).toEqual([TENANT]);
    }
  });

  it("lets runs through while the switch is off, and never stops workflow routes", async () => {
    expect((await run("/chat/assistant", () => Promise.resolve(false))).nextCalled).toBe(true);
    const workflow = await run("/api/workflows/approval-demo/start-async", () => Promise.resolve(true));
    expect(workflow.nextCalled).toBe(true);
    expect(workflow.asked).toEqual([]);
  });

  it("leaves an unauthenticated call to the route auth (no flag read)", async () => {
    const { nextCalled, asked } = await run("/chat/assistant", () => Promise.resolve(true), { authorization: "Bearer nope", "x-request-id": REQUEST_ID });
    expect(nextCalled).toBe(true);
    expect(asked).toEqual([]);
  });
});
