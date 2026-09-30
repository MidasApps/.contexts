import { describe, expect, it } from "vitest";
import { createRouteAllowlistMiddleware, isAllowedRoute } from "./route-allowlist-middleware.ts";

const run = async (method: string, path: string, apiPrefix?: string) => {
  const middleware = createRouteAllowlistMiddleware(apiPrefix === undefined ? {} : { apiPrefix });
  let nextCalled = false;
  const context = { req: { raw: new Request(`http://mastra.internal${path}`, { method }) }, get: () => new Map() };
  const response = await middleware.handler(context, () => {
    nextCalled = true;
    return Promise.resolve();
  });
  return { nextCalled, status: response instanceof Response ? response.status : undefined };
};

describe("isAllowedRoute with hidden agents", () => {
  it("closes every agent route of a hidden (chat-only) agent and keeps the others", () => {
    expect(isAllowedRoute("POST", "/agents/assistant-chat/stream", ["assistant-chat"])).toBe(false);
    expect(isAllowedRoute("GET", "/agents/assistant-chat", ["assistant-chat"])).toBe(false);
    expect(isAllowedRoute("POST", "/agents/assistant/stream", ["assistant-chat"])).toBe(true);
  });
});

describe("createRouteAllowlistMiddleware", () => {
  it("is mounted on the API prefix", () => {
    expect(createRouteAllowlistMiddleware({}).path).toBe("/api/*");
    expect(createRouteAllowlistMiddleware({ apiPrefix: "/mastra/" }).path).toBe("/mastra/*");
  });

  it("answers 404 for built-in groups the core does not use", async () => {
    for (const [method, path] of [
      ["GET", "/api/vectors/x"],
      ["POST", "/api/vector/default/query"],
      ["POST", "/api/tools/catalog.listEntities/execute"],
      ["POST", "/api/agents/assistant/tools/catalog.listEntities/execute"],
      ["POST", "/api/agents/assistant/model"],
      ["POST", "/api/v1/responses"],
      ["GET", "/api/v1/conversations"],
      ["GET", "/api/stored/agents"],
      ["POST", "/api/memory/save-messages"],
      ["POST", "/api/mcp/core/tools/catalog.listEntities/execute"],
    ] as const) {
      expect(await run(method, path), `${method} ${path}`).toEqual({ nextCalled: false, status: 404 });
    }
  });

  it("passes the agent, memory read, workflow, schedule, MCP, observability and dataset routes", async () => {
    for (const [method, path] of [
      ["POST", "/api/agents/x/stream"],
      ["POST", "/api/agents/x/generate"],
      ["POST", "/api/agents/x/approve-tool-call"],
      ["GET", "/api/agents"],
      ["GET", "/api/memory/threads/t1/messages"],
      ["DELETE", "/api/memory/threads/t1"],
      ["POST", "/api/workflows/knowledge-ingest/start-async"],
      ["GET", "/api/schedules"],
      ["POST", "/api/mcp/core/mcp"],
      ["GET", "/api/observability/traces"],
      ["GET", "/api/datasets"],
    ] as const) {
      expect(await run(method, path), `${method} ${path}`).toEqual({ nextCalled: true, status: undefined });
    }
  });

  it("uses the configured prefix", async () => {
    expect(await run("GET", "/mastra/vectors/x", "/mastra")).toEqual({ nextCalled: false, status: 404 });
    expect(await run("POST", "/mastra/agents/x/stream", "/mastra")).toEqual({ nextCalled: true, status: undefined });
  });
});

describe("isAllowedRoute", () => {
  it("never allows a path that only resembles an allowed one", () => {
    expect(isAllowedRoute("POST", "/agents/x/stream/extra")).toBe(false);
    expect(isAllowedRoute("POST", "/agents/x/../../vectors/y")).toBe(false);
    expect(isAllowedRoute("PATCH", "/memory/threads/t1")).toBe(false);
  });
});
