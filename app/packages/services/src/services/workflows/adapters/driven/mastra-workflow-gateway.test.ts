import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import { createMastraWorkflowGateway } from "./mastra-workflow-gateway.ts";

const scope: AgentCallScope = {
  bearer: "user-token",
  tenantId: "OrgAaaaaaaaaaaaaaaaaa",
  regional: { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" },
  requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
};

const gatewayAnswering = (status: number, body: unknown) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    seen.push({ url, init: init ?? {} });
    return Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { gateway: createMastraWorkflowGateway({ baseUrl: "http://mastra:4111/", serverlessToken: null, fetch: fetch as unknown as typeof globalThis.fetch }), seen };
};

describe("createMastraWorkflowGateway", () => {
  it("calls the custom route outside the API prefix with the caller's Bearer and tenant", async () => {
    const { gateway, seen } = gatewayAnswering(202, { data: { runId: "run-9" } });
    expect(await gateway.startRun(scope, { workflowId: "approval-demo", inputData: { title: "x" } })).toEqual({ ok: true, data: { runId: "run-9" } });
    expect(seen[0]?.url).toBe("http://mastra:4111/workflow-runs/start/approval-demo");
    const headers = seen[0]?.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer user-token");
    expect(headers["x-tenant-id"]).toBe(scope.tenantId);
  });

  it("passes an allowlisted code of our routes with its details", async () => {
    const { gateway } = gatewayAnswering(422, { error: { code: "SCHEDULE_INTERVAL_TOO_SHORT", message: "x", details: [{ field: "cron", issue: "TOO_FREQUENT" }] } });
    expect(await gateway.createSchedule(scope, { cron: "* * * * *" })).toEqual({
      ok: false,
      error: { code: "SCHEDULE_INTERVAL_TOO_SHORT", status: 422, details: [{ field: "cron", issue: "TOO_FREQUENT" }] },
    });
  });

  it("maps anything else by status only", async () => {
    expect(await gatewayAnswering(403, { error: "Forbidden" }).gateway.getRun(scope, "run-1")).toEqual({ ok: false, error: { code: "FORBIDDEN", status: 403 } });
    expect(await gatewayAnswering(400, { error: { code: "SQL_ERROR", message: "x" } }).gateway.getRun(scope, "run-1")).toEqual({ ok: false, error: { code: "VALIDATION_FAILED", status: 400 } });
    expect(await gatewayAnswering(500, { error: { code: "WORKFLOW_NOT_STARTABLE" } }).gateway.getRun(scope, "run-1")).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
  });

  it("refuses a success body that breaks the contract", async () => {
    expect(await gatewayAnswering(200, { data: { runId: 1 } }).gateway.getRun(scope, "run-1")).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
  });
});
