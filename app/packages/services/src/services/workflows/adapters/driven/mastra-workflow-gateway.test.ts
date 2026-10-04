import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import { createMastraWorkflowGateway } from "./mastra-workflow-gateway.ts";

const scope: AgentCallScope = {
  bearer: "user-token",
  tenantId: "OrgAaaaaaaaaaaaaaaaaa",
  regional: {
    locale: "pt-BR",
    displayTimeZone: "America/Sao_Paulo",
    nodeTimeZone: "America/Sao_Paulo",
    currency: "BRL",
  },
  requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
};

const gatewayAnswering = (status: number, body: unknown) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    seen.push({ url, init: init ?? {} });
    return Promise.resolve(
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return {
    gateway: createMastraWorkflowGateway({
      baseUrl: "http://mastra:4111/",
      serverlessToken: null,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }),
    seen,
  };
};

describe("createMastraWorkflowGateway", () => {
  it("calls the custom route outside the API prefix with the caller's Bearer and tenant", async () => {
    const { gateway, seen } = gatewayAnswering(202, { data: { runId: "run-9" } });
    expect(await gateway.startRun(scope, { workflowId: "approval-demo", inputData: { title: "x" } })).toEqual({
      ok: true,
      data: { runId: "run-9" },
    });
    expect(seen[0]?.url).toBe("http://mastra:4111/workflow-runs/start/approval-demo");
    const headers = seen[0]?.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer user-token");
    expect(headers["x-tenant-id"]).toBe(scope.tenantId);
  });

  it("passes an allowlisted code of our routes with its details", async () => {
    const { gateway } = gatewayAnswering(422, {
      error: { code: "SCHEDULE_INTERVAL_TOO_SHORT", message: "x", details: [{ field: "cron", issue: "TOO_FREQUENT" }] },
    });
    expect(await gateway.createSchedule(scope, { cron: "* * * * *" })).toEqual({
      ok: false,
      error: { code: "SCHEDULE_INTERVAL_TOO_SHORT", status: 422, details: [{ field: "cron", issue: "TOO_FREQUENT" }] },
    });
  });

  it("maps anything else by status only", async () => {
    expect(await gatewayAnswering(403, { error: "Forbidden" }).gateway.getRun(scope, "run-1")).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", status: 403 },
    });
    expect(
      await gatewayAnswering(400, { error: { code: "SQL_ERROR", message: "x" } }).gateway.getRun(scope, "run-1"),
    ).toEqual({ ok: false, error: { code: "VALIDATION_FAILED", status: 400 } });
    expect(
      await gatewayAnswering(500, { error: { code: "WORKFLOW_NOT_STARTABLE" } }).gateway.getRun(scope, "run-1"),
    ).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
  });

  it("reads the tenant catalogs and refuses an entry that breaks the contract", async () => {
    const agent = {
      key: "knowledge",
      name: "Knowledge",
      description: "x",
      source: "core",
      moduleId: null,
      enabled: true,
      tools: [{ id: "knowledge.searchKnowledge", kind: "read", source: "core" }],
      skills: [],
    };
    const { gateway, seen } = gatewayAnswering(200, { data: [agent] });
    expect(await gateway.listAgentCatalog(scope)).toEqual({ ok: true, data: [agent] });
    expect(seen[0]?.url).toBe("http://mastra:4111/tenant-catalog/agents");
    const workflows = gatewayAnswering(200, {
      data: [{ id: "usage-report", description: "x", startable: false, schedulable: true, inputSchema: null }],
    });
    expect(await workflows.gateway.listWorkflowCatalog(scope)).toMatchObject({
      ok: true,
      data: [{ id: "usage-report", schedulable: true }],
    });
    expect(workflows.seen[0]?.url).toBe("http://mastra:4111/tenant-catalog/workflows");
    const leaky = gatewayAnswering(200, { data: [{ ...agent, instructions: "system prompt" }] });
    expect(await leaky.gateway.listAgentCatalog(scope)).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
  });

  it("posts a schedule preview and reads its fires", async () => {
    const { gateway, seen } = gatewayAnswering(200, { data: { nextFireTimes: ["2026-10-01T12:00:00.000Z"] } });
    expect(await gateway.previewSchedule(scope, { cron: "0 9 * * *", timezone: "America/Sao_Paulo" })).toEqual({
      ok: true,
      data: { nextFireTimes: ["2026-10-01T12:00:00.000Z"] },
    });
    expect(seen[0]?.url).toBe("http://mastra:4111/tenant-schedules/preview");
    expect(seen[0]?.init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ cron: "0 9 * * *", timezone: "America/Sao_Paulo" }),
    });
  });

  it("refuses a success body that breaks the contract", async () => {
    expect(await gatewayAnswering(200, { data: { runId: 1 } }).gateway.getRun(scope, "run-1")).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
  });
});

describe("custom agent runtime routes (decision 0046)", () => {
  it("reads the agent options and posts the cache invalidation", async () => {
    const options = {
      models: ["chat"],
      tools: [{ id: "catalog.listEntities", kind: "read", source: "core", description: "Lists." }],
      coreSkills: [],
    };
    const read = gatewayAnswering(200, { data: options });
    expect(await read.gateway.getCustomAgentOptions(scope)).toEqual({ ok: true, data: options });
    expect(read.seen[0]?.url).toBe("http://mastra:4111/tenant-catalog/agent-options");
    const leaky = gatewayAnswering(200, { data: { ...options, instructions: "system prompt" } });
    expect(await leaky.gateway.getCustomAgentOptions(scope)).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
    const dropped = gatewayAnswering(204, null);
    expect(await dropped.gateway.invalidateCustomAgents(scope)).toEqual({ ok: true, data: null });
    expect(dropped.seen[0]).toMatchObject({ url: "http://mastra:4111/tenant-catalog/custom-agents/invalidate" });
  });
});
